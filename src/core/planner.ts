import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  LockedFile,
  LockedPackage,
  PackageDependencyMap,
  PlannedFileOperation,
  ProfileDocument,
  ProfileLockfile,
  ResolutionResult,
  SyncPlan
} from "../types.js";
import { LOCK_SCHEMA_VERSION } from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { CorePaths } from "../storage/paths.js";
import { normalizeRelative, pathKey, rejectNestedLinks, resolveInside } from "../utils/path.js";
import { sha256Bytes, sha256File, sha256Object } from "../utils/hash.js";

interface FileState {
  exists: boolean;
  sha256?: string;
  size?: number;
}

export class SyncPlanner {
  constructor(private readonly paths: CorePaths, private readonly now: () => Date) {}

  async plan(
    profile: ProfileDocument,
    requirements: PackageDependencyMap,
    resolution: ResolutionResult,
    currentLock?: ProfileLockfile
  ): Promise<SyncPlan> {
    const desiredPackages: Record<string, LockedPackage> = {};
    const desiredFiles = new Map<string, { lock: LockedFile; operationSource: { url: string; size: number; sha256: string } }>();

    for (const packageId of resolution.order) {
      const resolved = resolution.packages.get(packageId)!;
      const descriptor = resolved.descriptor;
      const artifactsBySource = new Map(descriptor.artifacts.map(artifact => [artifact.source.toLowerCase(), artifact]));
      const lockedArtifacts: LockedPackage["artifacts"] = [];
      for (const rule of descriptor.manifest.files) {
        const artifact = artifactsBySource.get(rule.source.toLowerCase());
        if (!artifact) throw new ModeDockCoreError(`Missing artifact metadata for ${packageId}:${rule.source}`, "INVALID_PACKAGE");
        const destinationRoot = profile.destinations[rule.destination];
        if (destinationRoot === undefined) {
          throw new ModeDockCoreError(
            `Package '${packageId}' requires unknown destination '${rule.destination}'.`,
            "DESTINATION_NOT_CONFIGURED",
            { packageId, destination: rule.destination, configured: Object.keys(profile.destinations) }
          );
        }
        const targetWithin = rule.target ?? path.posix.basename(rule.source);
        const targetRelative = normalizeRelative(path.posix.join(destinationRoot === "." ? "" : destinationRoot, targetWithin));
        const key = pathKey(targetRelative);
        const existing = desiredFiles.get(key);
        if (existing) {
          throw new ModeDockCoreError(`Package file collision at '${targetRelative}'.`, "FILE_CONFLICT", {
            targetRelative,
            packageId,
            existingPackage: existing.lock.packageId
          });
        }
        const lockedFile: LockedFile = {
          packageId,
          packageVersion: descriptor.manifest.version,
          targetRelative,
          sha256: artifact.sha256,
          size: artifact.size,
          executable: rule.executable === true
        };
        desiredFiles.set(key, { lock: lockedFile, operationSource: { url: artifact.url, size: artifact.size, sha256: artifact.sha256 } });
        lockedArtifacts.push({ ...artifact, destination: rule.destination, targetRelative });
      }
      desiredPackages[packageId] = {
        id: packageId,
        version: descriptor.manifest.version,
        name: descriptor.manifest.name,
        integrity: descriptor.integrity,
        registry: resolved.registry.name,
        dependencies: { ...(descriptor.manifest.dependencies ?? {}) },
        artifacts: lockedArtifacts
      };
    }

    const operations: PlannedFileOperation[] = [];
    const nextFiles: Record<string, LockedFile> = {};
    for (const [key, desired] of desiredFiles) {
      const destination = resolveInside(profile.game.rootDir, desired.lock.targetRelative);
      await rejectNestedLinks(profile.game.rootDir, destination);
      const actual = await fileState(destination);
      const current = currentLock?.files[key];
      if (current) {
        assertManagedState(desired.lock.targetRelative, current, actual);
        if (current.original) await this.verifyOriginalBackup(current.original, desired.lock.targetRelative);
        const next: LockedFile = { ...desired.lock, ...(current.original ? { original: current.original } : {}) };
        nextFiles[key] = next;
        if (current.sha256 !== desired.lock.sha256 || current.executable !== desired.lock.executable) {
          operations.push({
            action: "write",
            targetRelative: desired.lock.targetRelative,
            destination,
            packageId: desired.lock.packageId,
            packageVersion: desired.lock.packageVersion,
            sourceUrl: desired.operationSource.url,
            sourceSha256: desired.operationSource.sha256,
            sourceSize: desired.operationSource.size,
            executable: desired.lock.executable,
            precondition: { kind: "sha256", sha256: current.sha256 },
            ...(current.original ? { preserveOriginal: current.original } : {})
          });
        }
        continue;
      }

      if (actual.exists) {
        const backupPath = this.paths.original(profile.id, sha256Bytes(key).slice(0, 40));
        const original = { path: backupPath, sha256: actual.sha256!, size: actual.size! };
        nextFiles[key] = { ...desired.lock, original };
        operations.push({
          action: "write",
          targetRelative: desired.lock.targetRelative,
          destination,
          packageId: desired.lock.packageId,
          packageVersion: desired.lock.packageVersion,
          sourceUrl: desired.operationSource.url,
          sourceSha256: desired.operationSource.sha256,
          sourceSize: desired.operationSource.size,
          executable: desired.lock.executable,
          precondition: { kind: "sha256", sha256: actual.sha256! },
          preserveOriginal: original
        });
      } else {
        nextFiles[key] = { ...desired.lock };
        operations.push({
          action: "write",
          targetRelative: desired.lock.targetRelative,
          destination,
          packageId: desired.lock.packageId,
          packageVersion: desired.lock.packageVersion,
          sourceUrl: desired.operationSource.url,
          sourceSha256: desired.operationSource.sha256,
          sourceSize: desired.operationSource.size,
          executable: desired.lock.executable,
          precondition: { kind: "absent" }
        });
      }
    }

    for (const [key, current] of Object.entries(currentLock?.files ?? {})) {
      if (desiredFiles.has(key)) continue;
      const destination = resolveInside(profile.game.rootDir, current.targetRelative);
      await rejectNestedLinks(profile.game.rootDir, destination);
      const actual = await fileState(destination);
      assertManagedState(current.targetRelative, current, actual);
      if (current.original) {
        await this.verifyOriginalBackup(current.original, current.targetRelative);
        operations.push({
          action: "restore-original",
          targetRelative: current.targetRelative,
          destination,
          packageId: current.packageId,
          packageVersion: current.packageVersion,
          precondition: { kind: "sha256", sha256: current.sha256 },
          original: current.original
        });
      } else {
        operations.push({
          action: "remove",
          targetRelative: current.targetRelative,
          destination,
          packageId: current.packageId,
          packageVersion: current.packageVersion,
          precondition: { kind: "sha256", sha256: current.sha256 }
        });
      }
    }

    const generatedAt = this.now().toISOString();
    const nextLock: ProfileLockfile = {
      schemaVersion: LOCK_SCHEMA_VERSION,
      profileId: profile.id,
      generatedAt,
      requirements: { ...requirements },
      resolutionOrder: [...resolution.order],
      packages: desiredPackages,
      files: nextFiles
    };
    const currentPackages = currentLock?.packages ?? {};
    const packagesAdded = Object.keys(desiredPackages).filter(id => !currentPackages[id]);
    const packagesRemoved = Object.keys(currentPackages).filter(id => !desiredPackages[id]);
    const packagesUpdated = Object.keys(desiredPackages).filter(id => currentPackages[id] && currentPackages[id]!.version !== desiredPackages[id]!.version);
    return {
      id: randomUUID().replaceAll("-", ""),
      profileId: profile.id,
      createdAt: generatedAt,
      requirements: { ...requirements },
      baseLockHash: sha256Object(currentLock ?? null),
      nextLock,
      operations,
      summary: {
        packagesAdded,
        packagesUpdated,
        packagesRemoved,
        filesWritten: operations.filter(item => item.action === "write").length,
        filesRemoved: operations.filter(item => item.action === "remove").length,
        filesRestored: operations.filter(item => item.action === "restore-original").length,
        downloadBytes: operations.filter(item => item.action === "write").reduce((sum, item) => sum + (item.sourceSize ?? 0), 0)
      }
    };
  }

  private async verifyOriginalBackup(original: { path: string; sha256: string; size: number }, targetRelative: string): Promise<void> {
    const state = await fileState(original.path);
    if (!state.exists) throw new ModeDockCoreError(`Original backup is missing for '${targetRelative}'.`, "BACKUP_MISSING", { targetRelative, backup: original.path });
    if (state.sha256 !== original.sha256 || state.size !== original.size) {
      throw new ModeDockCoreError(`Original backup changed for '${targetRelative}'.`, "BACKUP_INTEGRITY_ERROR", { targetRelative, backup: original.path });
    }
  }
}

async function fileState(file: string): Promise<FileState> {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new ModeDockCoreError(`Managed destination is not a regular file: ${file}`, "UNSAFE_DESTINATION", { file });
    return { exists: true, size: info.size, sha256: await sha256File(file) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

function assertManagedState(targetRelative: string, current: LockedFile, actual: FileState): void {
  if (!actual.exists) throw new ModeDockCoreError(`Managed file is missing: ${targetRelative}`, "INTEGRITY_ERROR", { targetRelative });
  if (actual.sha256 !== current.sha256 || actual.size !== current.size) {
    throw new ModeDockCoreError(`Managed file was modified outside ModeDOCK: ${targetRelative}`, "INTEGRITY_ERROR", {
      targetRelative,
      expected: { sha256: current.sha256, size: current.size },
      actual
    });
  }
}
