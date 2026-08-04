export type LogLevel = "error" | "warn" | "info" | "debug";
export type LogoStyle = "full" | "compact";
export type ThemeName = "default" | "mono" | "amber";
export type LanguageName = "en" | "ru";
export type DestinationKind = "root" | "mods" | "plugins" | "config";

export interface ModeDockConfig {
  defaultTarget?: string;
  dataDir?: string;
  createBackups: boolean;
  confirmBeforeRemove: boolean;
  language: LanguageName;
  theme: ThemeName;
  logoStyle: LogoStyle;
  logLevel: LogLevel;
  detectionRoots: string[];
  customAdapters: string[];
  maxArchiveFiles: number;
  maxArchiveBytes: number;
}

export interface InstallationRule {
  extensions: string[];
  destination: DestinationKind | string;
}

export interface TargetProfile {
  id: string;
  name: string;
  rootDir: string;
  executable: string;
  modsDir: string;
  pluginsDir: string;
  configDir: string;
  loader: string;
  adapterId: string;
  supportedExtensions: string[];
  rules: InstallationRule[];
  createdAt: string;
  updatedAt: string;
}

export interface InstallationFile {
  relative: string;
  sha256: string;
  size: number;
  hadOriginal: boolean;
  backupCreated: boolean;
  originalSha256?: string;
}

export interface InstallationRecord {
  id: string;
  targetId: string;
  adapterId: string;
  name: string;
  sourcePath: string;
  sourceName: string;
  sourceType: "file" | "folder" | "archive" | "legacy";
  installedAt: string;
  updatedAt: string;
  enabled: boolean;
  files: InstallationFile[];
}

export interface SourceEntry {
  relative: string;
  size: number;
  sha256: string;
  sourcePath?: string;
  content?: Uint8Array;
}

export interface PlannedFile extends SourceEntry {
  destination: string;
  targetRelative: string;
  destinationKind: DestinationKind | string;
  exists: boolean;
  conflictOwner?: string;
}

export interface InstallPlan {
  id: string;
  target: TargetProfile;
  sourcePath: string;
  sourceName: string;
  sourceType: InstallationRecord["sourceType"];
  name: string;
  adapterId: string;
  files: PlannedFile[];
  overwrites: string[];
  conflicts: Array<{ path: string; owner: string }>;
  totalBytes: number;
}

export interface InstallOptions {
  destination?: string;
  dryRun?: boolean;
  force?: boolean;
  noBackup?: boolean;
  excludeInstallationId?: string;
}

export interface DetectedTarget {
  detectionId: string;
  adapterId: string;
  name: string;
  rootDir: string;
  executable: string;
  confidence: "high" | "medium" | "low";
  loader?: string;
}

export interface DetectionContext {
  roots: string[];
  platform: NodeJS.Platform;
}

export interface TargetAdapter {
  id: string;
  name: string;
  detect(context: DetectionContext): Promise<DetectedTarget[]>;
  createProfile(input: Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">): TargetProfile;
  validate(profile: TargetProfile): Promise<string[]>;
  routeFile(profile: TargetProfile, sourceRelative: string): DestinationKind | string;
}

export interface FormatAdapter {
  id: string;
  canHandle(sourcePath: string): Promise<boolean>;
  expand(sourcePath: string, limits: { maxFiles: number; maxBytes: number }): Promise<{
    type: InstallationRecord["sourceType"];
    entries: SourceEntry[];
  }>;
}

export interface TransactionFile {
  destination: string;
  targetRelative: string;
  backupPath?: string;
  hadOriginal: boolean;
  expectedSha256: string;
  state: "planned" | "prepared" | "applied";
}

export interface TransactionJournal {
  id: string;
  operation: "install" | "snapshot-restore";
  targetId: string;
  targetRoot: string;
  createdAt: string;
  files: TransactionFile[];
}

export interface BackupSnapshot {
  id: string;
  targetId: string;
  name: string;
  createdAt: string;
  files: Array<{ relative: string; sha256: string; size: number }>;
}

export interface CommandResult<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
}
