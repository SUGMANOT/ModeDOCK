export const PACKAGE_SCHEMA_VERSION = 1 as const;
export const REGISTRY_SCHEMA_VERSION = 1 as const;
export const PROFILE_SCHEMA_VERSION = 1 as const;
export const LOCK_SCHEMA_VERSION = 1 as const;
export const JOURNAL_SCHEMA_VERSION = 1 as const;
export const CHALLENGE_CAPSULE_SCHEMA_VERSION = 1 as const;
export const CHALLENGE_SESSION_SCHEMA_VERSION = 1 as const;
export const CHALLENGE_TICKET_SCHEMA_VERSION = 1 as const;
export const CHALLENGE_RESULT_SCHEMA_VERSION = 1 as const;

export type PlatformName = NodeJS.Platform;
export type ArchitectureName = NodeJS.Architecture;
export type PackageScope = "client" | "server" | "both";

export interface PackageDependencyMap {
  readonly [packageId: string]: string;
}

export interface PackageFileRule {
  /** Relative path inside the package payload. */
  source: string;
  /** Logical destination configured by the game profile, for example `plugins`. */
  destination: string;
  /** Optional path below the logical destination. Defaults to basename(source). */
  target?: string;
  /** Unix executable bit for launch helpers on supported platforms. */
  executable?: boolean;
}

export interface ModPackageManifest {
  schemaVersion: typeof PACKAGE_SCHEMA_VERSION;
  id: string;
  version: string;
  name: string;
  description?: string;
  authors?: string[];
  homepage?: string;
  license?: string;
  scope?: PackageScope;
  game: {
    id: string;
    version?: string;
  };
  loader?: {
    id: string;
    version?: string;
  };
  platforms?: PlatformName[];
  architectures?: ArchitectureName[];
  dependencies?: PackageDependencyMap;
  optionalDependencies?: PackageDependencyMap;
  conflicts?: PackageDependencyMap;
  files: PackageFileRule[];
}

export interface PackageArtifact {
  source: string;
  size: number;
  sha256: string;
  url: string;
}

export interface PackageDescriptor {
  schemaVersion: typeof PACKAGE_SCHEMA_VERSION;
  manifest: ModPackageManifest;
  artifacts: PackageArtifact[];
  /** SHA-256 of the canonical manifest and artifact metadata. */
  integrity: string;
}

export interface RegistryVersionEntry {
  descriptor: string;
  integrity?: string;
}

export interface RegistryIndex {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  name: string;
  packages: Record<string, Record<string, RegistryVersionEntry>>;
}

export interface RegistryReference {
  name: string;
  location: string;
}

export interface GameEnvironment {
  id: string;
  rootDir: string;
  version?: string;
  loader?: {
    id: string;
    version?: string;
  };
  platform: PlatformName;
  architecture: ArchitectureName;
}

export interface ProfileDocument {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  id: string;
  name: string;
  game: GameEnvironment;
  destinations: Record<string, string>;
  requirements: PackageDependencyMap;
  registries: RegistryReference[];
  createdAt: string;
  updatedAt: string;
}

export interface LockedArtifact extends PackageArtifact {
  destination: string;
  targetRelative: string;
}

export interface LockedPackage {
  id: string;
  version: string;
  name: string;
  integrity: string;
  registry: string;
  dependencies: PackageDependencyMap;
  artifacts: LockedArtifact[];
}

export interface OriginalFileBackup {
  path: string;
  sha256: string;
  size: number;
}

export interface LockedFile {
  packageId: string;
  packageVersion: string;
  targetRelative: string;
  sha256: string;
  size: number;
  executable: boolean;
  original?: OriginalFileBackup;
}

export interface ProfileLockfile {
  schemaVersion: typeof LOCK_SCHEMA_VERSION;
  profileId: string;
  generatedAt: string;
  requirements: PackageDependencyMap;
  resolutionOrder: string[];
  packages: Record<string, LockedPackage>;
  files: Record<string, LockedFile>;
}

export type PlanFileAction = "write" | "remove" | "restore-original";

export interface FilePrecondition {
  kind: "absent" | "sha256";
  sha256?: string;
}

export interface PlannedFileOperation {
  action: PlanFileAction;
  targetRelative: string;
  destination: string;
  packageId?: string;
  packageVersion?: string;
  sourceUrl?: string;
  sourceSha256?: string;
  sourceSize?: number;
  executable?: boolean;
  precondition: FilePrecondition;
  original?: OriginalFileBackup;
  preserveOriginal?: OriginalFileBackup;
}

export interface SyncPlan {
  id: string;
  profileId: string;
  createdAt: string;
  requirements: PackageDependencyMap;
  baseLockHash: string;
  nextLock: ProfileLockfile;
  operations: PlannedFileOperation[];
  summary: {
    packagesAdded: string[];
    packagesUpdated: string[];
    packagesRemoved: string[];
    filesWritten: number;
    filesRemoved: number;
    filesRestored: number;
    downloadBytes: number;
  };
}

export type JournalOperationState = "planned" | "staged" | "mutating" | "applied" | "rolled-back";

export interface JournalFileEntry {
  operation: PlannedFileOperation;
  beforeSnapshot?: string;
  stagedPayload?: string;
  state: "planned" | "snapshotted" | "applied";
}

export interface TransactionJournal {
  schemaVersion: typeof JOURNAL_SCHEMA_VERSION;
  id: string;
  profileId: string;
  gameRoot: string;
  createdAt: string;
  state: JournalOperationState;
  previousLock?: ProfileLockfile;
  previousProfile: ProfileDocument;
  nextProfile: ProfileDocument;
  nextLock: ProfileLockfile;
  files: JournalFileEntry[];
}

export interface ResolutionDiagnostic {
  packageId: string;
  message: string;
}

export interface ResolvedPackage {
  descriptor: PackageDescriptor;
  registry: RegistryReference;
}

export interface ResolutionResult {
  packages: Map<string, ResolvedPackage>;
  order: string[];
  diagnostics: ResolutionDiagnostic[];
}

export interface VerificationIssue {
  code: "MISSING" | "MODIFIED" | "UNEXPECTED_OWNER" | "BACKUP_MISSING" | "BACKUP_MODIFIED";
  path: string;
  packageId?: string;
  message: string;
}

export interface VerificationReport {
  profileId: string;
  ok: boolean;
  checkedFiles: number;
  issues: VerificationIssue[];
}

export interface CoreOptions {
  dataDir?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Test-only hook. Production callers should leave this undefined. */
  faultInjector?: (point: string, context: unknown) => void | Promise<void>;
}

export interface CreateProfileInput {
  id: string;
  name?: string;
  gameId: string;
  rootDir: string;
  gameVersion?: string;
  loaderId?: string;
  loaderVersion?: string;
  destinations?: Record<string, string>;
  registries?: RegistryReference[];
}

export interface ApplyOptions {
  dryRun?: boolean;
}

export interface PublisherOptions {
  baseUrl?: string;
}

export type ChallengeAudience = "player" | "streamer" | "creator" | "launcher";
export type ChallengeEnvironmentMode = "overlay" | "exact";
export type ChallengeEvidenceCapture = "hash" | "copy";
export type ChallengeClaimType = "string" | "number" | "boolean";
export type ChallengeSessionStatus = "preparing" | "prepared" | "armed" | "completed" | "restored";

export interface ChallengeEvidenceRule {
  /** Relative path below the game root. The game root itself is intentionally forbidden. */
  path: string;
  capture?: ChallengeEvidenceCapture;
  required?: boolean;
  /** Maximum total bytes inspected or copied for this evidence item. */
  maxBytes?: number;
}

export interface ChallengeClaimDefinition {
  id: string;
  label: string;
  type: ChallengeClaimType;
  required?: boolean;
  description?: string;
}

export interface ChallengeCapsuleManifest {
  schemaVersion: typeof CHALLENGE_CAPSULE_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  summary?: string;
  authors?: string[];
  homepage?: string;
  tags?: string[];
  audience?: ChallengeAudience[];
  game: {
    id: string;
    version?: string;
    loader?: {
      id: string;
      version?: string;
    };
    platforms?: PlatformName[];
    architectures?: ArchitectureName[];
  };
  environment: {
    mode: ChallengeEnvironmentMode;
    packages: PackageDependencyMap;
  };
  brief: {
    objective: string;
    rules?: string[];
    notes?: string[];
    estimatedMinutes?: number;
    difficulty?: "casual" | "standard" | "hard" | "extreme";
  };
  evidence?: {
    watch?: ChallengeEvidenceRule[];
    claims?: ChallengeClaimDefinition[];
    requireStableEnvironment?: boolean;
  };
  /** Human or launcher-facing handoff metadata. ModeDOCK never executes it. */
  handoff?: {
    label?: string;
    instructions?: string[];
    consumerData?: Record<string, string>;
  };
}

export interface ChallengeInspection {
  source: string;
  capsule: ChallengeCapsuleManifest;
  integrity: string;
  compatible?: boolean;
  compatibilityIssues: string[];
}

export interface ChallengeEvidenceEntry {
  path: string;
  exists: boolean;
  kind?: "file" | "directory";
  sha256?: string;
  size: number;
  entries: number;
}

export interface ChallengeEvidenceDelta {
  path: string;
  capture: ChallengeEvidenceCapture;
  required: boolean;
  before: ChallengeEvidenceEntry;
  after: ChallengeEvidenceEntry;
  changed: boolean;
  copiedTo?: string;
}

export interface ChallengeTicket {
  schemaVersion: typeof CHALLENGE_TICKET_SCHEMA_VERSION;
  id: string;
  sessionId: string;
  profileId: string;
  capsuleId: string;
  capsuleVersion: string;
  capsuleIntegrity: string;
  issuedAt: string;
  nonce: string;
  participant?: string;
  environmentHash: string;
  baselineHash: string;
  objective: string;
  rules: string[];
  handoff?: ChallengeCapsuleManifest["handoff"];
  integrity: string;
}

export interface ChallengeSession {
  schemaVersion: typeof CHALLENGE_SESSION_SCHEMA_VERSION;
  id: string;
  profileId: string;
  capsuleSource: string;
  capsule: ChallengeCapsuleManifest;
  capsuleIntegrity: string;
  status: ChallengeSessionStatus;
  previousRequirements: PackageDependencyMap;
  effectiveRequirements: PackageDependencyMap;
  preparedAt?: string;
  armedAt?: string;
  completedAt?: string;
  restoredAt?: string;
  baseline?: ChallengeEvidenceEntry[];
  ticket?: ChallengeTicket;
  resultPath?: string;
}

export interface ChallengeResult {
  schemaVersion: typeof CHALLENGE_RESULT_SCHEMA_VERSION;
  id: string;
  sessionId: string;
  profileId: string;
  capsuleId: string;
  capsuleVersion: string;
  capsuleIntegrity: string;
  ticketIntegrity: string;
  participant?: string;
  startedAt: string;
  finishedAt: string;
  environmentBefore: string;
  environmentAfter: string;
  environmentStable: boolean;
  evidence: ChallengeEvidenceDelta[];
  claims: Record<string, string | number | boolean>;
  verdict: {
    valid: boolean;
    requiredEvidencePresent: boolean;
    requiredClaimsPresent: boolean;
    reasons: string[];
  };
  integrity: string;
}

export interface PrepareChallengeOptions extends ApplyOptions {}

export interface PrepareChallengeResult {
  inspection: ChallengeInspection;
  plan: SyncPlan;
  session?: ChallengeSession;
}

export interface ArmChallengeInput {
  participant?: string;
}

export interface FinishChallengeInput {
  claims?: Record<string, string | number | boolean>;
  outputDir?: string;
  restore?: boolean;
}

export interface FinishChallengeResult {
  result: ChallengeResult;
  resultPath: string;
  session: ChallengeSession;
}

export interface RestoreChallengeResult {
  plan: SyncPlan;
  session?: ChallengeSession;
}

export interface CreateChallengeTemplateInput {
  id: string;
  gameId: string;
  title?: string;
}
