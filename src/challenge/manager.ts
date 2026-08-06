import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { ModeDockCore } from "../core/core.js";
import type {
  ArmChallengeInput,
  ChallengeCapsuleManifest,
  ChallengeEvidenceDelta,
  ChallengeEvidenceEntry,
  ChallengeInspection,
  ChallengeResult,
  ChallengeSession,
  ChallengeTicket,
  FinishChallengeInput,
  FinishChallengeResult,
  PrepareChallengeOptions,
  PrepareChallengeResult,
  ProfileDocument,
  ProfileLockfile,
  RestoreChallengeResult
} from "../types.js";
import {
  CHALLENGE_RESULT_SCHEMA_VERSION,
  CHALLENGE_SESSION_SCHEMA_VERSION,
  CHALLENGE_TICKET_SCHEMA_VERSION
} from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { readJsonResource, normalizeResource } from "../registry/resource.js";
import { satisfies } from "../semver.js";
import { sha256Object } from "../utils/hash.js";
import { validateChallengeCapsule, validateClaimsRecord } from "../validation.js";
import { writeJsonFile } from "../storage/json.js";
import { ProfileMutex } from "../storage/profile-mutex.js";
import { ChallengeStore } from "./store.js";
import { snapshotEvidence } from "./evidence.js";

export class ChallengeManager {
  readonly store: ChallengeStore;

  constructor(
    private readonly core: ModeDockCore,
    private readonly fetchImpl: typeof fetch,
    private readonly now: () => Date
  ) {
    this.store = new ChallengeStore(core.paths);
  }

  async inspect(source: string, profileId?: string): Promise<ChallengeInspection> {
    const normalized = normalizeResource(source);
    const capsule = validateChallengeCapsule(await readJsonResource<unknown>(normalized, this.fetchImpl));
    const compatibilityIssues = profileId ? this.compatibilityIssues(capsule, await this.core.profiles.get(profileId)) : [];
    return {
      source: normalized,
      capsule,
      integrity: sha256Object(capsule),
      ...(profileId ? { compatible: compatibilityIssues.length === 0 } : {}),
      compatibilityIssues
    };
  }

  async prepare(profileId: string, source: string, options: PrepareChallengeOptions = {}): Promise<PrepareChallengeResult> {
    const profileMutex = new ProfileMutex(this.core.paths.challengeProfileMutex(profileId));
    const release = await profileMutex.acquire();
    try {
      const inspection = await this.inspect(source, profileId);
      if (inspection.compatibilityIssues.length) {
        throw new ModeDockCoreError("Challenge capsule is not compatible with this profile.", "CHALLENGE_INCOMPATIBLE", { issues: inspection.compatibilityIssues });
      }
      const active = (await this.store.list()).find(session => session.profileId === profileId && session.status !== "restored");
      if (active) throw new ModeDockCoreError(`Profile '${profileId}' already has active challenge session '${active.id}'.`, "CHALLENGE_SESSION_ACTIVE");
      const profile = await this.core.profiles.get(profileId);
      const effectiveRequirements = inspection.capsule.environment.mode === "overlay"
        ? { ...profile.requirements, ...inspection.capsule.environment.packages }
        : { ...inspection.capsule.environment.packages };
      const plan = await this.core.planSync(profileId, effectiveRequirements);
      if (options.dryRun) return { inspection, plan };

      const session: ChallengeSession = {
        schemaVersion: CHALLENGE_SESSION_SCHEMA_VERSION,
        id: `challenge-${randomUUID()}`,
        profileId,
        capsuleSource: inspection.source,
        capsule: inspection.capsule,
        capsuleIntegrity: inspection.integrity,
        status: "preparing",
        previousRequirements: { ...profile.requirements },
        effectiveRequirements: { ...effectiveRequirements }
      };
      await this.store.save(session);
      try {
        await this.core.applyPlan(plan);
        const prepared: ChallengeSession = { ...session, status: "prepared", preparedAt: this.now().toISOString() };
        await this.store.save(prepared);
        return { inspection, plan, session: prepared };
      } catch (error) {
        await this.store.remove(session.id).catch(() => undefined);
        throw error;
      }
    } finally {
      await release();
    }
  }

  async arm(sessionId: string, input: ArmChallengeInput = {}): Promise<ChallengeTicket> {
    return this.withSessionLock(sessionId, async () => {
      const session = await this.store.get(sessionId);
      if (session.status !== "prepared") throw new ModeDockCoreError(`Challenge session '${sessionId}' is ${session.status}, not prepared.`, "INVALID_CHALLENGE_STATE");
      const profile = await this.core.profiles.get(session.profileId);
      if (sha256Object(profile.requirements) !== sha256Object(session.effectiveRequirements)) {
        throw new ModeDockCoreError("Profile requirements changed after challenge preparation.", "CHALLENGE_ENVIRONMENT_CHANGED");
      }
      const verification = await this.core.verify(session.profileId);
      if (!verification.ok) throw new ModeDockCoreError("Managed environment failed verification and cannot be armed.", "CHALLENGE_ENVIRONMENT_INVALID", { issues: verification.issues });
      const baseline = await snapshotEvidence(profile.game.rootDir, session.capsule.evidence?.watch ?? []);
      const environmentHash = await this.environmentFingerprint(profile, await this.core.profiles.readLock(profile.id));
      const issuedAt = this.now().toISOString();
      const unsignedTicket = {
        schemaVersion: CHALLENGE_TICKET_SCHEMA_VERSION,
        id: `ticket-${randomUUID()}`,
        sessionId: session.id,
        profileId: session.profileId,
        capsuleId: session.capsule.id,
        capsuleVersion: session.capsule.version,
        capsuleIntegrity: session.capsuleIntegrity,
        issuedAt,
        nonce: randomBytes(24).toString("hex"),
        ...(input.participant ? { participant: input.participant.trim() } : {}),
        environmentHash,
        baselineHash: sha256Object(baseline),
        objective: session.capsule.brief.objective,
        rules: [...(session.capsule.brief.rules ?? [])],
        ...(session.capsule.handoff ? { handoff: session.capsule.handoff } : {})
      };
      if (input.participant !== undefined && !input.participant.trim()) throw new ModeDockCoreError("Participant cannot be empty.", "INVALID_CHALLENGE_PARTICIPANT");
      const ticket: ChallengeTicket = { ...unsignedTicket, integrity: sha256Object(unsignedTicket) };
      const armed: ChallengeSession = { ...session, status: "armed", armedAt: issuedAt, baseline, ticket };
      await this.store.save(armed);
      return ticket;
    });
  }

  async finish(sessionId: string, input: FinishChallengeInput = {}): Promise<FinishChallengeResult> {
    const output = await this.withSessionLock(sessionId, async () => {
      const session = await this.store.get(sessionId);
      if (session.status !== "armed" || !session.ticket || !session.baseline) {
        throw new ModeDockCoreError(`Challenge session '${sessionId}' is not armed.`, "INVALID_CHALLENGE_STATE");
      }
      const profile = await this.core.profiles.get(session.profileId);
      const claims = validateClaimsRecord(input.claims ?? {}, session.capsule.evidence?.claims ?? []);
      const resultId = `result-${randomUUID()}`;
      const outputDir = path.resolve(input.outputDir ?? this.core.paths.challengeResultDir(resultId));
      assertOutsideGameRoot(profile.game.rootDir, outputDir);
      await mkdir(outputDir, { recursive: true });
      const afterWithCopies = await snapshotEvidence(profile.game.rootDir, session.capsule.evidence?.watch ?? [], path.join(outputDir, "evidence"));
      const evidence = buildEvidenceDeltas(session.capsule, session.baseline, afterWithCopies);
      const lock = await this.core.profiles.readLock(profile.id);
      const environmentAfter = await this.environmentFingerprint(profile, lock);
      const verification = await this.core.verify(profile.id);
      const environmentStable = environmentAfter === session.ticket.environmentHash && verification.ok;
      const requiredEvidencePresent = evidence.every(item => !item.required || item.after.exists);
      const requiredClaimsPresent = (session.capsule.evidence?.claims ?? []).every(definition => !definition.required || Object.hasOwn(claims, definition.id));
      const reasons: string[] = [];
      if (!requiredEvidencePresent) reasons.push("One or more required evidence paths are missing.");
      if (!requiredClaimsPresent) reasons.push("One or more required claims are missing.");
      if ((session.capsule.evidence?.requireStableEnvironment ?? true) && !environmentStable) reasons.push("The managed environment changed after the challenge was armed.");
      const finishedAt = this.now().toISOString();
      const unsignedResult = {
        schemaVersion: CHALLENGE_RESULT_SCHEMA_VERSION,
        id: resultId,
        sessionId: session.id,
        profileId: session.profileId,
        capsuleId: session.capsule.id,
        capsuleVersion: session.capsule.version,
        capsuleIntegrity: session.capsuleIntegrity,
        ticketIntegrity: session.ticket.integrity,
        ...(session.ticket.participant ? { participant: session.ticket.participant } : {}),
        startedAt: session.ticket.issuedAt,
        finishedAt,
        environmentBefore: session.ticket.environmentHash,
        environmentAfter,
        environmentStable,
        evidence,
        claims,
        verdict: {
          valid: reasons.length === 0,
          requiredEvidencePresent,
          requiredClaimsPresent,
          reasons
        }
      };
      const result: ChallengeResult = { ...unsignedResult, integrity: sha256Object(unsignedResult) };
      const resultPath = path.join(outputDir, "result.json");
      await writeJsonFile(resultPath, result);
      const completed: ChallengeSession = { ...session, status: "completed", completedAt: finishedAt, resultPath };
      await this.store.save(completed);
      return { result, resultPath, session: completed };
    });
    if (!input.restore) return output;
    const restored = await this.restore(sessionId);
    if (!restored.session) throw new ModeDockCoreError("Challenge restore did not produce a session.", "INVALID_CHALLENGE_STATE");
    return { ...output, session: restored.session };
  }

  async restore(sessionId: string, options: PrepareChallengeOptions = {}): Promise<RestoreChallengeResult> {
    return this.withSessionLock(sessionId, async () => {
      const session = await this.store.get(sessionId);
      if (session.status === "restored") {
        const plan = await this.core.planSync(session.profileId, session.previousRequirements);
        return { plan, session };
      }
      const plan = await this.core.planSync(session.profileId, session.previousRequirements);
      if (options.dryRun) return { plan };
      await this.core.applyPlan(plan);
      const restored: ChallengeSession = { ...session, status: "restored", restoredAt: this.now().toISOString() };
      await this.store.save(restored);
      return { plan, session: restored };
    });
  }

  async list(): Promise<ChallengeSession[]> { return this.store.list(); }
  async get(sessionId: string): Promise<ChallengeSession> { return this.store.get(sessionId); }

  private compatibilityIssues(capsule: ChallengeCapsuleManifest, profile: ProfileDocument): string[] {
    const issues: string[] = [];
    if (capsule.game.id !== profile.game.id) issues.push(`Game mismatch: capsule requires '${capsule.game.id}', profile uses '${profile.game.id}'.`);
    if (capsule.game.version) {
      if (!profile.game.version) issues.push(`Capsule requires game version '${capsule.game.version}', but the profile has no version.`);
      else if (!satisfies(profile.game.version, capsule.game.version)) issues.push(`Game version ${profile.game.version} does not satisfy ${capsule.game.version}.`);
    }
    if (capsule.game.loader) {
      if (!profile.game.loader) issues.push(`Capsule requires loader '${capsule.game.loader.id}', but the profile has no loader.`);
      else {
        if (profile.game.loader.id !== capsule.game.loader.id) issues.push(`Loader mismatch: capsule requires '${capsule.game.loader.id}', profile uses '${profile.game.loader.id}'.`);
        if (capsule.game.loader.version) {
          if (!profile.game.loader.version) issues.push(`Capsule requires loader version '${capsule.game.loader.version}', but the profile has no loader version.`);
          else if (!satisfies(profile.game.loader.version, capsule.game.loader.version)) issues.push(`Loader version ${profile.game.loader.version} does not satisfy ${capsule.game.loader.version}.`);
        }
      }
    }
    if (capsule.game.platforms && !capsule.game.platforms.includes(profile.game.platform)) issues.push(`Platform '${profile.game.platform}' is not supported by the capsule.`);
    if (capsule.game.architectures && !capsule.game.architectures.includes(profile.game.architecture)) issues.push(`Architecture '${profile.game.architecture}' is not supported by the capsule.`);
    return issues;
  }

  private async environmentFingerprint(profile: ProfileDocument, lock: ProfileLockfile | undefined): Promise<string> {
    const verification = await this.core.verify(profile.id);
    return sha256Object({
      game: {
        id: profile.game.id,
        version: profile.game.version ?? null,
        loader: profile.game.loader ?? null,
        platform: profile.game.platform,
        architecture: profile.game.architecture
      },
      requirements: profile.requirements,
      lock: lock ?? null,
      verification
    });
  }

  private async withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const mutex = new ProfileMutex(this.core.paths.challengeSessionMutex(sessionId));
    const release = await mutex.acquire();
    try { return await operation(); }
    finally { await release(); }
  }
}

function buildEvidenceDeltas(
  capsule: ChallengeCapsuleManifest,
  before: ChallengeEvidenceEntry[],
  after: Array<ChallengeEvidenceEntry & { copiedTo?: string }>
): ChallengeEvidenceDelta[] {
  const rules = capsule.evidence?.watch ?? [];
  return rules.map((rule, index) => {
    const beforeEntry = before[index] ?? { path: rule.path, exists: false, size: 0, entries: 0 };
    const afterEntry = after[index] ?? { path: rule.path, exists: false, size: 0, entries: 0 };
    const { copiedTo, ...cleanAfter } = afterEntry;
    return {
      path: rule.path,
      capture: rule.capture ?? "hash",
      required: rule.required ?? false,
      before: beforeEntry,
      after: cleanAfter,
      changed: sha256Object(beforeEntry) !== sha256Object(cleanAfter),
      ...(copiedTo ? { copiedTo } : {})
    };
  });
}

function assertOutsideGameRoot(gameRoot: string, outputDir: string): void {
  const root = path.resolve(gameRoot);
  const output = path.resolve(outputDir);
  const relative = path.relative(root, output);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new ModeDockCoreError("Challenge result output must be outside the game root.", "UNSAFE_RESULT_PATH", { gameRoot: root, outputDir: output });
  }
}
