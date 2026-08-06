import { stat } from "node:fs/promises";
import type { ProfileDocument, ProfileLockfile, VerificationIssue, VerificationReport } from "../types.js";
import { resolveInside } from "../utils/path.js";
import { sha256File } from "../utils/hash.js";

export async function verifyProfile(profile: ProfileDocument, lock: ProfileLockfile | undefined): Promise<VerificationReport> {
  const issues: VerificationIssue[] = [];
  const files = Object.values(lock?.files ?? {});
  for (const file of files) {
    const destination = resolveInside(profile.game.rootDir, file.targetRelative);
    const state = await inspect(destination);
    if (!state.exists) {
      issues.push({ code: "MISSING", path: file.targetRelative, packageId: file.packageId, message: "Managed file is missing." });
      continue;
    }
    if (state.sha256 !== file.sha256 || state.size !== file.size) {
      issues.push({ code: "MODIFIED", path: file.targetRelative, packageId: file.packageId, message: "Managed file was modified outside ModeDOCK." });
    }
    if (file.original) {
      const backup = await inspect(file.original.path);
      if (!backup.exists) {
        issues.push({ code: "BACKUP_MISSING", path: file.targetRelative, packageId: file.packageId, message: "Original file backup is missing." });
      } else if (backup.sha256 !== file.original.sha256 || backup.size !== file.original.size) {
        issues.push({ code: "BACKUP_MODIFIED", path: file.targetRelative, packageId: file.packageId, message: "Original file backup was modified." });
      }
    }
  }
  return { profileId: profile.id, ok: issues.length === 0, checkedFiles: files.length, issues };
}

async function inspect(file: string): Promise<{ exists: boolean; sha256?: string; size?: number }> {
  try {
    const info = await stat(file);
    if (!info.isFile()) return { exists: true, size: info.size, sha256: "<not-a-file>" };
    return { exists: true, size: info.size, sha256: await sha256File(file) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}
