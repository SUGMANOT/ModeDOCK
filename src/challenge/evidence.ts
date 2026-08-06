import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { ChallengeEvidenceEntry, ChallengeEvidenceRule } from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { sha256File, sha256Object } from "../utils/hash.js";
import { rejectNestedLinks, resolveInside } from "../utils/path.js";

const MAX_EVIDENCE_ENTRIES = 5000;

interface FileEntry {
  relative: string;
  absolute: string;
  size: number;
  sha256: string;
}

export async function snapshotEvidence(
  gameRoot: string,
  rules: ChallengeEvidenceRule[],
  copyRoot?: string
): Promise<Array<ChallengeEvidenceEntry & { copiedTo?: string }>> {
  const snapshots: Array<ChallengeEvidenceEntry & { copiedTo?: string }> = [];
  for (const rule of rules) snapshots.push(await snapshotRule(gameRoot, rule, copyRoot));
  return snapshots;
}

async function snapshotRule(
  gameRoot: string,
  rule: ChallengeEvidenceRule,
  copyRoot?: string
): Promise<ChallengeEvidenceEntry & { copiedTo?: string }> {
  const target = resolveInside(gameRoot, rule.path);
  await rejectNestedLinks(gameRoot, target);
  let info;
  try { info = await lstat(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: rule.path, exists: false, size: 0, entries: 0 };
    throw error;
  }
  if (info.isSymbolicLink()) throw new ModeDockCoreError(`Evidence path is a symbolic link: ${rule.path}`, "UNSAFE_LINK");
  const limit = rule.maxBytes ?? 16 * 1024 * 1024;
  if (info.isFile()) {
    if (info.size > limit) throw new ModeDockCoreError(`Evidence file exceeds maxBytes: ${rule.path}`, "EVIDENCE_TOO_LARGE", { size: info.size, limit });
    const snapshot: ChallengeEvidenceEntry & { copiedTo?: string } = {
      path: rule.path,
      exists: true,
      kind: "file",
      size: info.size,
      entries: 1,
      sha256: await sha256File(target)
    };
    if (copyRoot && rule.capture === "copy") {
      const destination = resolveInside(copyRoot, rule.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(target, destination);
      snapshot.copiedTo = path.relative(path.dirname(copyRoot), destination).replaceAll(path.sep, "/");
    }
    return snapshot;
  }
  if (!info.isDirectory()) throw new ModeDockCoreError(`Evidence path is neither file nor directory: ${rule.path}`, "INVALID_EVIDENCE_TYPE");
  const files = await collectDirectory(target, limit);
  const snapshot: ChallengeEvidenceEntry & { copiedTo?: string } = {
    path: rule.path,
    exists: true,
    kind: "directory",
    size: files.reduce((total, file) => total + file.size, 0),
    entries: files.length,
    sha256: sha256Object(files.map(file => ({ path: file.relative, size: file.size, sha256: file.sha256 })))
  };
  if (copyRoot && rule.capture === "copy") {
    const destinationRoot = resolveInside(copyRoot, rule.path);
    await mkdir(destinationRoot, { recursive: true });
    for (const file of files) {
      const destination = resolveInside(destinationRoot, file.relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.absolute, destination);
    }
    snapshot.copiedTo = path.relative(path.dirname(copyRoot), destinationRoot).replaceAll(path.sep, "/");
  }
  return snapshot;
}

async function collectDirectory(root: string, maxBytes: number): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  let bytes = 0;
  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new ModeDockCoreError(`Evidence directory contains a symbolic link: ${relative}`, "UNSAFE_LINK");
      if (entry.isDirectory()) { await visit(absolute, relative); continue; }
      if (!entry.isFile()) throw new ModeDockCoreError(`Evidence directory contains an unsupported entry: ${relative}`, "INVALID_EVIDENCE_TYPE");
      const info = await lstat(absolute);
      bytes += info.size;
      if (bytes > maxBytes) throw new ModeDockCoreError("Evidence directory exceeds maxBytes.", "EVIDENCE_TOO_LARGE", { root, bytes, maxBytes });
      if (result.length >= MAX_EVIDENCE_ENTRIES) throw new ModeDockCoreError("Evidence directory contains too many files.", "EVIDENCE_TOO_MANY_FILES", { root, max: MAX_EVIDENCE_ENTRIES });
      result.push({ relative, absolute, size: info.size, sha256: await sha256File(absolute) });
    }
  }
  await visit(root, "");
  return result;
}
