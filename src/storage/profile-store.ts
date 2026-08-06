import path from "node:path";
import { mkdir, readdir, rm } from "node:fs/promises";
import type { ProfileDocument, ProfileLockfile } from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { validateLockfile, validateProfile } from "../validation.js";
import { CorePaths } from "./paths.js";
import { readJsonFile, readJsonFileOptional, writeJsonFile } from "./json.js";

export class ProfileStore {
  constructor(private readonly paths: CorePaths) {}

  async list(): Promise<ProfileDocument[]> {
    try {
      const entries = await readdir(this.paths.profiles, { withFileTypes: true });
      const profiles: ProfileDocument[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try { profiles.push(await this.get(entry.name)); } catch { /* doctor can report invalid state separately */ }
      }
      return profiles.sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async get(profileId: string): Promise<ProfileDocument> {
    const value = await readJsonFile<unknown>(this.paths.profile(profileId));
    return validateProfile(value);
  }

  async getOptional(profileId: string): Promise<ProfileDocument | undefined> {
    const value = await readJsonFileOptional<unknown>(this.paths.profile(profileId));
    return value === undefined ? undefined : validateProfile(value);
  }

  async save(profile: ProfileDocument): Promise<void> {
    const validated = validateProfile(profile);
    await mkdir(this.paths.profileDir(profile.id), { recursive: true });
    await writeJsonFile(this.paths.profile(profile.id), validated);
  }

  async remove(profileId: string): Promise<void> {
    const lock = await this.readLock(profileId);
    if (lock && Object.keys(lock.files).length) {
      throw new ModeDockCoreError(`Profile '${profileId}' still owns installed files. Remove its requirements and sync first.`, "PROFILE_NOT_EMPTY");
    }
    await rm(this.paths.profileDir(profileId), { recursive: true, force: true });
  }

  async readLock(profileId: string): Promise<ProfileLockfile | undefined> {
    const value = await readJsonFileOptional<unknown>(this.paths.lockfile(profileId));
    if (value === undefined) return undefined;
    const lock = validateLockfile(value);
    this.assertBackupPaths(lock);
    return lock;
  }

  async writeLock(lock: ProfileLockfile): Promise<void> {
    const validated = validateLockfile(lock);
    this.assertBackupPaths(validated);
    await writeJsonFile(this.paths.lockfile(validated.profileId), validated);
  }

  private assertBackupPaths(lock: ProfileLockfile): void {
    const root = path.resolve(this.paths.originals(lock.profileId));
    for (const file of Object.values(lock.files)) {
      if (!file.original) continue;
      const backup = path.resolve(file.original.path);
      const relative = path.relative(root, backup);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new ModeDockCoreError(`Lockfile backup path escaped profile state: ${file.targetRelative}`, "CORRUPT_STATE", { backup });
      }
    }
  }
}
