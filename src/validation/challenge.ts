import {
  CHALLENGE_CAPSULE_SCHEMA_VERSION,
  CHALLENGE_RESULT_SCHEMA_VERSION,
  CHALLENGE_SESSION_SCHEMA_VERSION,
  CHALLENGE_TICKET_SCHEMA_VERSION,
  type ChallengeCapsuleManifest,
  type ChallengeClaimDefinition,
  type ChallengeEvidenceEntry,
  type ChallengeEvidenceRule,
  type ChallengeResult,
  type ChallengeSession,
  type ChallengeTicket
} from "../types.js";
import { ValidationError } from "../errors.js";
import { parseVersion } from "../semver.js";
import { normalizeRelative, pathKey } from "../utils/path.js";
import {
  asRecord,
  expectArray,
  expectBoolean,
  expectInteger,
  expectIsoDate,
  expectNonEmpty,
  expectNumber,
  expectString,
  expectStringArray,
  validateDependencyMap,
  validateId,
  validateResourceLocation,
  validateSha256
} from "./common.js";

export const DEFAULT_EVIDENCE_MAX_BYTES = 16 * 1024 * 1024;
export const MAX_EVIDENCE_MAX_BYTES = 256 * 1024 * 1024;

export function validateChallengeCapsule(value: unknown): ChallengeCapsuleManifest {
  const input = asRecord(value, "challenge capsule");
  if (input.schemaVersion !== CHALLENGE_CAPSULE_SCHEMA_VERSION) throw new ValidationError("Unsupported challenge capsule schemaVersion.");
  const id = validateId(input.id, "challenge capsule ID");
  const version = expectString(input.version, "challenge capsule version");
  parseVersion(version);
  const title = expectNonEmpty(input.title, "challenge capsule title");

  const gameInput = asRecord(input.game, "challenge.game");
  const game: ChallengeCapsuleManifest["game"] = { id: validateId(gameInput.id, "challenge game ID") };
  if (gameInput.version !== undefined) game.version = expectString(gameInput.version, "challenge.game.version");
  if (gameInput.loader !== undefined) {
    const loader = asRecord(gameInput.loader, "challenge.game.loader");
    game.loader = {
      id: validateId(loader.id, "challenge loader ID"),
      ...(loader.version === undefined ? {} : { version: expectString(loader.version, "challenge.game.loader.version") })
    };
  }
  if (gameInput.platforms !== undefined) game.platforms = expectStringArray(gameInput.platforms, "challenge.game.platforms") as NodeJS.Platform[];
  if (gameInput.architectures !== undefined) game.architectures = expectStringArray(gameInput.architectures, "challenge.game.architectures") as NodeJS.Architecture[];

  const environmentInput = asRecord(input.environment, "challenge.environment");
  const mode = expectString(environmentInput.mode, "challenge.environment.mode");
  if (mode !== "overlay" && mode !== "exact") throw new ValidationError("challenge.environment.mode must be overlay or exact.");

  const briefInput = asRecord(input.brief, "challenge.brief");
  const brief: ChallengeCapsuleManifest["brief"] = { objective: expectNonEmpty(briefInput.objective, "challenge.brief.objective") };
  if (briefInput.rules !== undefined) brief.rules = expectStringArray(briefInput.rules, "challenge.brief.rules").map((item, index) => nonEmptyItem(item, `challenge.brief.rules[${index}]`));
  if (briefInput.notes !== undefined) brief.notes = expectStringArray(briefInput.notes, "challenge.brief.notes").map((item, index) => nonEmptyItem(item, `challenge.brief.notes[${index}]`));
  if (briefInput.estimatedMinutes !== undefined) brief.estimatedMinutes = expectInteger(briefInput.estimatedMinutes, "challenge.brief.estimatedMinutes", 1);
  if (briefInput.difficulty !== undefined) {
    const difficulty = expectString(briefInput.difficulty, "challenge.brief.difficulty");
    if (!["casual", "standard", "hard", "extreme"].includes(difficulty)) throw new ValidationError("Invalid challenge difficulty.");
    brief.difficulty = difficulty as "casual" | "standard" | "hard" | "extreme";
  }

  const result: ChallengeCapsuleManifest = {
    schemaVersion: CHALLENGE_CAPSULE_SCHEMA_VERSION,
    id,
    version,
    title,
    game,
    environment: { mode, packages: validateDependencyMap(environmentInput.packages, "challenge.environment.packages") },
    brief
  };

  if (input.summary !== undefined) result.summary = expectString(input.summary, "challenge.summary");
  if (input.authors !== undefined) result.authors = expectStringArray(input.authors, "challenge.authors");
  if (input.homepage !== undefined) {
    const homepage = expectString(input.homepage, "challenge.homepage");
    validateResourceLocation(homepage, "challenge.homepage");
    result.homepage = homepage;
  }
  if (input.tags !== undefined) result.tags = uniqueStrings(expectStringArray(input.tags, "challenge.tags"), "challenge.tags");
  if (input.audience !== undefined) {
    const audience = uniqueStrings(expectStringArray(input.audience, "challenge.audience"), "challenge.audience");
    for (const value of audience) if (!["player", "streamer", "creator", "launcher"].includes(value)) throw new ValidationError(`Invalid challenge audience: ${value}`);
    result.audience = audience as Array<"player" | "streamer" | "creator" | "launcher">;
  }

  if (input.evidence !== undefined) {
    const evidenceInput = asRecord(input.evidence, "challenge.evidence");
    const evidence: NonNullable<ChallengeCapsuleManifest["evidence"]> = {};
    if (evidenceInput.watch !== undefined) evidence.watch = validateEvidenceRules(evidenceInput.watch);
    if (evidenceInput.claims !== undefined) evidence.claims = validateClaimDefinitions(evidenceInput.claims);
    if (evidenceInput.requireStableEnvironment !== undefined) evidence.requireStableEnvironment = expectBoolean(evidenceInput.requireStableEnvironment, "challenge.evidence.requireStableEnvironment");
    result.evidence = evidence;
  }

  if (input.handoff !== undefined) {
    const handoffInput = asRecord(input.handoff, "challenge.handoff");
    const handoff: NonNullable<ChallengeCapsuleManifest["handoff"]> = {};
    if (handoffInput.label !== undefined) handoff.label = expectNonEmpty(handoffInput.label, "challenge.handoff.label");
    if (handoffInput.instructions !== undefined) handoff.instructions = expectStringArray(handoffInput.instructions, "challenge.handoff.instructions").map((item, index) => nonEmptyItem(item, `challenge.handoff.instructions[${index}]`));
    if (handoffInput.consumerData !== undefined) {
      const dataInput = asRecord(handoffInput.consumerData, "challenge.handoff.consumerData");
      const data: Record<string, string> = {};
      for (const [key, raw] of Object.entries(dataInput)) data[validateId(key, "challenge consumer data key")] = expectString(raw, `challenge.handoff.consumerData.${key}`);
      handoff.consumerData = data;
    }
    result.handoff = handoff;
  }
  return result;
}

function validateEvidenceRules(value: unknown): ChallengeEvidenceRule[] {
  const seen = new Set<string>();
  return expectArray(value, "challenge.evidence.watch").map((raw, index) => {
    const input = asRecord(raw, `challenge.evidence.watch[${index}]`);
    const relative = normalizeRelative(expectString(input.path, `challenge.evidence.watch[${index}].path`));
    if (relative === ".") throw new ValidationError("Challenge evidence cannot watch the entire game root.");
    const key = pathKey(relative);
    if (seen.has(key)) throw new ValidationError(`Duplicate challenge evidence path: ${relative}`);
    seen.add(key);
    const capture = input.capture === undefined ? "hash" : expectString(input.capture, `challenge.evidence.watch[${index}].capture`);
    if (capture !== "hash" && capture !== "copy") throw new ValidationError(`Invalid evidence capture mode: ${capture}`);
    const maxBytes = input.maxBytes === undefined ? DEFAULT_EVIDENCE_MAX_BYTES : expectInteger(input.maxBytes, `challenge.evidence.watch[${index}].maxBytes`, 1);
    if (maxBytes > MAX_EVIDENCE_MAX_BYTES) throw new ValidationError(`Evidence maxBytes exceeds ${MAX_EVIDENCE_MAX_BYTES}.`);
    return {
      path: relative,
      capture,
      required: input.required === undefined ? false : expectBoolean(input.required, `challenge.evidence.watch[${index}].required`),
      maxBytes
    };
  });
}

function validateClaimDefinitions(value: unknown): ChallengeClaimDefinition[] {
  const seen = new Set<string>();
  return expectArray(value, "challenge.evidence.claims").map((raw, index) => {
    const input = asRecord(raw, `challenge.evidence.claims[${index}]`);
    const id = validateId(input.id, "challenge claim ID");
    if (seen.has(id)) throw new ValidationError(`Duplicate challenge claim ID: ${id}`);
    seen.add(id);
    const type = expectString(input.type, `challenge.evidence.claims[${index}].type`);
    if (!["string", "number", "boolean"].includes(type)) throw new ValidationError(`Invalid challenge claim type: ${type}`);
    return {
      id,
      label: expectNonEmpty(input.label, `challenge.evidence.claims[${index}].label`),
      type: type as ChallengeClaimDefinition["type"],
      required: input.required === undefined ? false : expectBoolean(input.required, `challenge.evidence.claims[${index}].required`),
      ...(input.description === undefined ? {} : { description: expectString(input.description, `challenge.evidence.claims[${index}].description`) })
    };
  });
}

export function validateChallengeTicket(value: unknown): ChallengeTicket {
  const input = asRecord(value, "challenge ticket");
  if (input.schemaVersion !== CHALLENGE_TICKET_SCHEMA_VERSION) throw new ValidationError("Unsupported challenge ticket schemaVersion.");
  validateId(input.id, "challenge ticket ID");
  validateId(input.sessionId, "challenge session ID");
  validateId(input.profileId, "challenge profile ID");
  validateId(input.capsuleId, "challenge capsule ID");
  parseVersion(expectString(input.capsuleVersion, "challenge ticket capsuleVersion"));
  validateSha256(input.capsuleIntegrity, "challenge ticket capsuleIntegrity");
  expectIsoDate(input.issuedAt, "challenge ticket issuedAt");
  expectNonEmpty(input.nonce, "challenge ticket nonce");
  if (input.participant !== undefined) expectNonEmpty(input.participant, "challenge ticket participant");
  validateSha256(input.environmentHash, "challenge ticket environmentHash");
  validateSha256(input.baselineHash, "challenge ticket baselineHash");
  expectNonEmpty(input.objective, "challenge ticket objective");
  expectStringArray(input.rules, "challenge ticket rules");
  validateSha256(input.integrity, "challenge ticket integrity");
  return input as unknown as ChallengeTicket;
}

export function validateChallengeSession(value: unknown): ChallengeSession {
  const input = asRecord(value, "challenge session");
  if (input.schemaVersion !== CHALLENGE_SESSION_SCHEMA_VERSION) throw new ValidationError("Unsupported challenge session schemaVersion.");
  validateId(input.id, "challenge session ID");
  validateId(input.profileId, "challenge session profile ID");
  const source = expectString(input.capsuleSource, "challenge session capsuleSource");
  validateResourceLocation(source, "challenge session capsuleSource");
  const capsule = validateChallengeCapsule(input.capsule);
  validateSha256(input.capsuleIntegrity, "challenge session capsuleIntegrity");
  const status = expectString(input.status, "challenge session status");
  if (!["preparing", "prepared", "armed", "completed", "restored"].includes(status)) throw new ValidationError(`Invalid challenge session status: ${status}`);
  validateDependencyMap(input.previousRequirements, "challenge session previousRequirements");
  validateDependencyMap(input.effectiveRequirements, "challenge session effectiveRequirements");
  for (const field of ["preparedAt", "armedAt", "completedAt", "restoredAt"] as const) if (input[field] !== undefined) expectIsoDate(input[field], `challenge session ${field}`);
  if (input.baseline !== undefined) expectArray(input.baseline, "challenge session baseline").forEach((entry, index) => validateEvidenceEntry(entry, `challenge session baseline[${index}]`));
  if (input.ticket !== undefined) validateChallengeTicket(input.ticket);
  if (input.resultPath !== undefined) expectString(input.resultPath, "challenge session resultPath");
  if (capsule.id !== (input.capsule as Record<string, unknown>).id) throw new ValidationError("Challenge session capsule mismatch.");
  return input as unknown as ChallengeSession;
}

export function validateChallengeResult(value: unknown): ChallengeResult {
  const input = asRecord(value, "challenge result");
  if (input.schemaVersion !== CHALLENGE_RESULT_SCHEMA_VERSION) throw new ValidationError("Unsupported challenge result schemaVersion.");
  validateId(input.id, "challenge result ID");
  validateId(input.sessionId, "challenge result session ID");
  validateId(input.profileId, "challenge result profile ID");
  validateId(input.capsuleId, "challenge result capsule ID");
  parseVersion(expectString(input.capsuleVersion, "challenge result capsuleVersion"));
  validateSha256(input.capsuleIntegrity, "challenge result capsuleIntegrity");
  validateSha256(input.ticketIntegrity, "challenge result ticketIntegrity");
  if (input.participant !== undefined) expectNonEmpty(input.participant, "challenge result participant");
  expectIsoDate(input.startedAt, "challenge result startedAt");
  expectIsoDate(input.finishedAt, "challenge result finishedAt");
  validateSha256(input.environmentBefore, "challenge result environmentBefore");
  validateSha256(input.environmentAfter, "challenge result environmentAfter");
  expectBoolean(input.environmentStable, "challenge result environmentStable");
  expectArray(input.evidence, "challenge result evidence");
  validateClaimsRecord(input.claims, []);
  const verdict = asRecord(input.verdict, "challenge result verdict");
  expectBoolean(verdict.valid, "challenge result verdict.valid");
  expectBoolean(verdict.requiredEvidencePresent, "challenge result verdict.requiredEvidencePresent");
  expectBoolean(verdict.requiredClaimsPresent, "challenge result verdict.requiredClaimsPresent");
  expectStringArray(verdict.reasons, "challenge result verdict.reasons");
  validateSha256(input.integrity, "challenge result integrity");
  return input as unknown as ChallengeResult;
}

export function validateClaimsRecord(value: unknown, definitions: ChallengeClaimDefinition[]): Record<string, string | number | boolean> {
  const input = asRecord(value, "challenge claims");
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
  const result: Record<string, string | number | boolean> = {};
  for (const [id, raw] of Object.entries(input)) {
    const definition = definitionsById.get(id);
    if (definitions.length && !definition) throw new ValidationError(`Unknown challenge claim: ${id}`);
    const type = definition?.type ?? inferClaimType(raw);
    if (type === "string") result[id] = expectString(raw, `challenge claims.${id}`);
    else if (type === "number") result[id] = expectNumber(raw, `challenge claims.${id}`);
    else result[id] = expectBoolean(raw, `challenge claims.${id}`);
  }
  return result;
}

function validateEvidenceEntry(value: unknown, label: string): ChallengeEvidenceEntry {
  const input = asRecord(value, label);
  normalizeRelative(expectString(input.path, `${label}.path`));
  expectBoolean(input.exists, `${label}.exists`);
  if (input.kind !== undefined && !["file", "directory"].includes(expectString(input.kind, `${label}.kind`))) throw new ValidationError(`Invalid ${label}.kind.`);
  if (input.sha256 !== undefined) validateSha256(input.sha256, `${label}.sha256`);
  expectInteger(input.size, `${label}.size`, 0);
  expectInteger(input.entries, `${label}.entries`, 0);
  return input as unknown as ChallengeEvidenceEntry;
}

function uniqueStrings(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [index, raw] of values.entries()) {
    const value = nonEmptyItem(raw, `${label}[${index}]`);
    if (seen.has(value)) throw new ValidationError(`${label} contains duplicates: ${value}`);
    seen.add(value);
    result.push(value);
  }
  return result;
}

function nonEmptyItem(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new ValidationError(`${label} cannot be empty.`);
  return result;
}

function inferClaimType(value: unknown): ChallengeClaimDefinition["type"] {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new ValidationError("Challenge claim values must be string, number, or boolean.");
}
