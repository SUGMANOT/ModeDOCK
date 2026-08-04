import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { BackupSnapshot, TargetProfile, TransactionJournal } from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import type { InstallationStore } from "../stores/installation-store.js";
import { atomicCopy, ensureInside, exists, normalizeRelative, sha256File } from "../../services/filesystem/safe-fs.js";
import { readJson, writeJson } from "../../services/config/json-file.js";
import { ConfirmationRequiredError, ModeDockError } from "../errors.js";

export class BackupService {
  constructor(private readonly paths: DataPaths, private readonly installations: InstallationStore) {}

  async create(target: TargetProfile, name?: string): Promise<BackupSnapshot> {
    const records = await this.installations.list(target.id);
    const managed = [...new Set(records.flatMap(record => record.files.map(file => file.relative)))];
    if (!managed.length) throw new ModeDockError("No managed files exist for this target.", "NOTHING_TO_BACKUP");
    const id = randomUUID().replaceAll("-", "");
    const root = this.paths.snapshotDir(target.id, id);
    const snapshot: BackupSnapshot = { id, targetId: target.id, name: name?.trim() || `Snapshot ${new Date().toLocaleString()}`, createdAt: new Date().toISOString(), files: [] };
    for (const relative of managed) {
      const source = ensureInside(target.rootDir, path.join(target.rootDir, normalizeRelative(relative)));
      if (!await exists(source)) continue;
      const destination = path.join(root, "files", relative);
      await atomicCopy(source, destination);
      snapshot.files.push({ relative, sha256: await sha256File(destination), size: (await stat(destination)).size });
    }
    await writeJson(path.join(root, "manifest.json"), snapshot);
    return snapshot;
  }

  async list(targetId: string): Promise<BackupSnapshot[]> {
    const root = path.join(this.paths.snapshots, targetId);
    if (!await exists(root)) return [];
    const snapshots: BackupSnapshot[] = [];
    for (const directory of await readdir(root, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      try { snapshots.push(await readJson<BackupSnapshot>(path.join(root, directory.name, "manifest.json"))); } catch { /* doctor reports */ }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolve(targetId: string, selector: string): Promise<BackupSnapshot> {
    const snapshots = await this.list(targetId);
    const matches = snapshots.filter(item => item.id === selector || item.id.startsWith(selector) || item.name.toLowerCase() === selector.toLowerCase());
    if (matches.length !== 1) throw new ModeDockError(matches.length ? `Backup selector '${selector}' is ambiguous.` : `Backup not found: ${selector}`, "NOT_FOUND");
    return matches[0]!;
  }

  async planRestore(target: TargetProfile, snapshot: BackupSnapshot) {
    return snapshot.files.map(file => ({
      relative: file.relative,
      source: path.join(this.paths.snapshotDir(target.id, snapshot.id), "files", file.relative),
      destination: ensureInside(target.rootDir, path.join(target.rootDir, normalizeRelative(file.relative))),
      exists: true
    }));
  }

  async restore(target: TargetProfile, snapshot: BackupSnapshot, options: { force?: boolean; dryRun?: boolean } = {}) {
    const plan = await this.planRestore(target, snapshot);
    if (options.dryRun) return plan;
    if (!options.force) throw new ConfirmationRequiredError(`Restoring '${snapshot.name}' will overwrite ${plan.length} file(s). Confirm or use --force.`, plan);
    const rollbackRoot = path.join(this.paths.transactions, `snapshot-${snapshot.id}-current`);
    const journal: TransactionJournal = {
      id: `snapshot-${snapshot.id}`,
      operation: "snapshot-restore",
      targetId: target.id,
      targetRoot: target.rootDir,
      createdAt: new Date().toISOString(),
      files: []
    };
    await mkdir(rollbackRoot, { recursive: true });
    try {
      for (const item of plan) {
        const hadOriginal = await exists(item.destination);
        const backupPath = path.join(rollbackRoot, item.relative);
        if (hadOriginal) await atomicCopy(item.destination, backupPath);
        journal.files.push({
          destination: item.destination,
          targetRelative: item.relative,
          backupPath: hadOriginal ? backupPath : undefined,
          hadOriginal,
          expectedSha256: await sha256File(item.source),
          state: "prepared"
        });
        await writeJson(this.paths.transaction(journal.id), journal);
        await atomicCopy(item.source, item.destination);
        journal.files.at(-1)!.state = "applied";
        await writeJson(this.paths.transaction(journal.id), journal);
      }
      await rm(this.paths.transaction(journal.id), { force: true });
      await rm(rollbackRoot, { recursive: true, force: true });
      return plan;
    } catch (error) {
      for (const file of [...journal.files].reverse()) {
        if (file.hadOriginal && file.backupPath && await exists(file.backupPath)) await atomicCopy(file.backupPath, file.destination).catch(() => undefined);
        else await rm(file.destination, { force: true }).catch(() => undefined);
      }
      throw error;
    }
  }

  async remove(targetId: string, snapshot: BackupSnapshot): Promise<void> {
    await rm(this.paths.snapshotDir(targetId, snapshot.id), { recursive: true, force: true });
  }

  async prune(targetId: string, keep: number): Promise<BackupSnapshot[]> {
    const snapshots = await this.list(targetId);
    const removed = snapshots.slice(Math.max(0, keep));
    for (const snapshot of removed) await this.remove(targetId, snapshot);
    return removed;
  }
}
