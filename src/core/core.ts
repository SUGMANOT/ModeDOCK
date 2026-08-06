import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ApplyOptions,
  CoreOptions,
  CreateProfileInput,
  PackageDependencyMap,
  ProfileDocument,
  ProfileLockfile,
  RegistryReference,
  SyncPlan,
  VerificationReport
} from "../types.js";
import { PROFILE_SCHEMA_VERSION } from "../types.js";
import { ModeDockCoreError, PlanStaleError } from "../errors.js";
import { validateId, validateJournal, validateProfile } from "../validation.js";
import { CorePaths, defaultDataDir } from "../storage/paths.js";
import { ProfileStore } from "../storage/profile-store.js";
import { ProfileMutex } from "../storage/profile-mutex.js";
import { RegistrySet } from "../registry/static-registry.js";
import { DependencyResolver } from "./resolver.js";
import { SyncPlanner } from "./planner.js";
import { TransactionExecutor } from "./transaction.js";
import { verifyProfile } from "./verifier.js";
import { sha256Object } from "../utils/hash.js";
import { normalizeResource } from "../registry/resource.js";
import { readJsonFile } from "../storage/json.js";
import { ChallengeManager } from "../challenge/manager.js";

export class ModeDockCore {
  readonly paths: CorePaths;
  readonly profiles: ProfileStore;
  readonly challenges: ChallengeManager;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;
  private readonly planner: SyncPlanner;
  private readonly executor: TransactionExecutor;

  private constructor(private readonly options: CoreOptions) {
    this.paths = new CorePaths(options.dataDir ?? defaultDataDir());
    this.profiles = new ProfileStore(this.paths);
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.planner = new SyncPlanner(this.paths, this.now);
    this.executor = new TransactionExecutor(this.paths, this.profiles, options);
    this.challenges = new ChallengeManager(this, this.fetchImpl, this.now);
  }

  static async open(options: CoreOptions = {}): Promise<ModeDockCore> {
    const core = new ModeDockCore(options);
    await Promise.all([
      mkdir(core.paths.profiles, { recursive: true }),
      mkdir(core.paths.transactions, { recursive: true }),
      mkdir(core.paths.cache, { recursive: true }),
      mkdir(core.paths.challengeSessions, { recursive: true }),
      mkdir(core.paths.challengeResults, { recursive: true })
    ]);
    return core;
  }

  async createProfile(input: CreateProfileInput): Promise<ProfileDocument> {
    const id = validateId(input.id, "profile ID");
    if (await this.profiles.getOptional(id)) throw new ModeDockCoreError(`Profile already exists: ${id}`, "PROFILE_EXISTS");
    const rootDir = path.resolve(input.rootDir);
    const rootInfo = await stat(rootDir).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ModeDockCoreError(`Game root does not exist: ${rootDir}`, "GAME_ROOT_MISSING");
      throw error;
    });
    if (!rootInfo.isDirectory()) throw new ModeDockCoreError(`Game root is not a directory: ${rootDir}`, "INVALID_GAME_ROOT");
    const now = this.now().toISOString();
    const profile = validateProfile({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      id,
      name: input.name ?? id,
      game: {
        id: validateId(input.gameId, "game ID"),
        rootDir,
        platform: process.platform,
        architecture: process.arch,
        ...(input.gameVersion ? { version: input.gameVersion } : {}),
        ...(input.loaderId ? {
          loader: {
            id: validateId(input.loaderId, "loader ID"),
            ...(input.loaderVersion ? { version: input.loaderVersion } : {})
          }
        } : {})
      },
      destinations: input.destinations ?? {
        root: ".",
        mods: "Mods",
        plugins: "Plugins",
        config: "Config"
      },
      requirements: {},
      registries: input.registries ?? [],
      createdAt: now,
      updatedAt: now
    });
    await this.profiles.save(profile);
    return profile;
  }

  async addRegistry(profileId: string, reference: RegistryReference): Promise<ProfileDocument> {
    return this.updateProfile(profileId, profile => {
      if (profile.registries.some(item => item.name === reference.name)) {
        throw new ModeDockCoreError(`Registry name already exists: ${reference.name}`, "REGISTRY_EXISTS");
      }
      return { ...profile, registries: [...profile.registries, { name: validateId(reference.name, "registry name"), location: normalizeResource(reference.location) }] };
    });
  }

  async removeRegistry(profileId: string, name: string): Promise<ProfileDocument> {
    return this.updateProfile(profileId, profile => ({ ...profile, registries: profile.registries.filter(item => item.name !== name) }));
  }

  async planSync(profileId: string, requirements?: PackageDependencyMap): Promise<SyncPlan> {
    const profile = await this.profiles.get(profileId);
    const currentLock = await this.profiles.readLock(profileId);
    return this.planFor(profile, requirements ?? profile.requirements, currentLock);
  }

  async applyPlan(plan: SyncPlan, options: ApplyOptions = {}): Promise<ProfileLockfile> {
    if (options.dryRun) return plan.nextLock;
    const mutex = new ProfileMutex(this.paths.profileMutex(plan.profileId));
    const release = await mutex.acquire();
    try {
      const profile = await this.profiles.get(plan.profileId);
      const currentLock = await this.profiles.readLock(plan.profileId);
      const actualBase = sha256Object(currentLock ?? null);
      if (actualBase !== plan.baseLockHash) throw new PlanStaleError("moddock.lock.json", plan.baseLockHash, actualBase);
      const nextProfile: ProfileDocument = {
        ...profile,
        requirements: { ...plan.requirements },
        updatedAt: this.now().toISOString()
      };
      return await this.executor.apply(profile, nextProfile, plan, currentLock);
    } finally { await release(); }
  }

  async sync(profileId: string, options: ApplyOptions = {}): Promise<SyncPlan | ProfileLockfile> {
    return this.syncRequirements(profileId, undefined, options);
  }

  async add(profileId: string, packageSpec: string, options: ApplyOptions = {}): Promise<SyncPlan | ProfileLockfile> {
    const { packageId, range } = parsePackageSpec(packageSpec);
    const profile = await this.profiles.get(profileId);
    return this.syncRequirements(profileId, { ...profile.requirements, [packageId]: range }, options);
  }

  async remove(profileId: string, packageId: string, options: ApplyOptions = {}): Promise<SyncPlan | ProfileLockfile> {
    validateId(packageId, "package ID");
    const profile = await this.profiles.get(profileId);
    if (!(packageId in profile.requirements)) throw new ModeDockCoreError(`Package is not a direct profile requirement: ${packageId}`, "REQUIREMENT_NOT_FOUND");
    const requirements = { ...profile.requirements };
    delete requirements[packageId];
    return this.syncRequirements(profileId, requirements, options);
  }

  async update(profileId: string, packageId?: string, options: ApplyOptions = {}): Promise<SyncPlan | ProfileLockfile> {
    const profile = await this.profiles.get(profileId);
    if (packageId && !(packageId in profile.requirements)) {
      throw new ModeDockCoreError(`Package is not a direct profile requirement: ${packageId}`, "REQUIREMENT_NOT_FOUND");
    }
    return this.syncRequirements(profileId, profile.requirements, options);
  }

  async verify(profileId: string): Promise<VerificationReport> {
    const profile = await this.profiles.get(profileId);
    return verifyProfile(profile, await this.profiles.readLock(profileId));
  }

  async pendingTransactions(): Promise<Array<{ id: string; profileId: string; state: string; createdAt: string }>> {
    try {
      const entries = await readdir(this.paths.transactions, { withFileTypes: true });
      const result: Array<{ id: string; profileId: string; state: string; createdAt: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const journal = validateJournal(await readJsonFile<unknown>(this.paths.journal(entry.name)));
          result.push({ id: journal.id, profileId: journal.profileId, state: journal.state, createdAt: journal.createdAt });
        } catch {
          // Damaged journals remain on disk for doctor/manual inspection.
        }
      }
      return result.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async recover(transactionId: string): Promise<void> {
    const journal = validateJournal(await readJsonFile<unknown>(this.paths.journal(transactionId)));
    const mutex = new ProfileMutex(this.paths.profileMutex(journal.profileId));
    const release = await mutex.acquire();
    try { await this.executor.recover(transactionId); }
    finally { await release(); }
  }

  private async syncRequirements(
    profileId: string,
    requirements: PackageDependencyMap | undefined,
    options: ApplyOptions
  ): Promise<SyncPlan | ProfileLockfile> {
    const mutex = new ProfileMutex(this.paths.profileMutex(profileId));
    const release = await mutex.acquire();
    try {
      const profile = await this.profiles.get(profileId);
      const currentLock = await this.profiles.readLock(profileId);
      const plan = await this.planFor(profile, requirements ?? profile.requirements, currentLock);
      if (options.dryRun) return plan;
      const nextProfile: ProfileDocument = {
        ...profile,
        requirements: { ...plan.requirements },
        updatedAt: this.now().toISOString()
      };
      return await this.executor.apply(profile, nextProfile, plan, currentLock);
    } finally { await release(); }
  }

  private async planFor(
    profile: ProfileDocument,
    requirements: PackageDependencyMap,
    currentLock: ProfileLockfile | undefined
  ): Promise<SyncPlan> {
    const registries = new RegistrySet(profile.registries, this.fetchImpl);
    const resolution = await new DependencyResolver(registries, profile.game).resolve(requirements);
    return this.planner.plan(profile, requirements, resolution, currentLock);
  }

  private async updateProfile(profileId: string, update: (profile: ProfileDocument) => ProfileDocument): Promise<ProfileDocument> {
    const mutex = new ProfileMutex(this.paths.profileMutex(profileId));
    const release = await mutex.acquire();
    try {
      const current = await this.profiles.get(profileId);
      const next = validateProfile({ ...update(current), updatedAt: this.now().toISOString() });
      await this.profiles.save(next);
      return next;
    } finally { await release(); }
  }
}

export function parsePackageSpec(value: string): { packageId: string; range: string } {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return { packageId: validateId(value, "package ID"), range: "*" };
  const packageId = validateId(value.slice(0, separator), "package ID");
  const range = value.slice(separator + 1).trim();
  if (!range) throw new ModeDockCoreError(`Package range is empty: ${value}`, "INVALID_PACKAGE_SPEC");
  return { packageId, range };
}
