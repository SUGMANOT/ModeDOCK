import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { InstallationRecord } from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import { exists, safeId } from "../../services/filesystem/safe-fs.js";
import { readJson, writeJson } from "../../services/config/json-file.js";
import { resolveNamed } from "./target-store.js";

export class InstallationStore {
  constructor(private readonly paths: DataPaths) {}

  async list(targetId: string): Promise<InstallationRecord[]> {
    safeId(targetId);
    const directory = this.paths.installationDir(targetId);
    if (!await exists(directory)) return [];
    const records: InstallationRecord[] = [];
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json")) continue;
      try {
        const record = await readJson<InstallationRecord>(path.join(directory, name));
        if (record.targetId === targetId && `${record.id}.json` === name) records.push(record);
      } catch { /* doctor reports corrupt files separately */ }
    }
    return records.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
  }

  async corruptFiles(targetId: string): Promise<string[]> {
    const directory = this.paths.installationDir(safeId(targetId));
    if (!await exists(directory)) return [];
    const corrupt: string[] = [];
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json")) continue;
      try {
        const record = await readJson<InstallationRecord>(path.join(directory, name));
        if (record.targetId !== targetId || `${record.id}.json` !== name || !Array.isArray(record.files)) corrupt.push(path.join(directory, name));
      } catch { corrupt.push(path.join(directory, name)); }
    }
    return corrupt;
  }

  async save(record: InstallationRecord): Promise<void> {
    safeId(record.targetId); safeId(record.id);
    await writeJson(this.paths.installation(record.targetId, record.id), record);
  }

  async resolve(targetId: string, selector: string): Promise<InstallationRecord> {
    return resolveNamed(selector, await this.list(targetId), "mod or plugin");
  }

  async remove(targetId: string, id: string): Promise<void> {
    await rm(this.paths.installation(safeId(targetId), safeId(id)), { force: true });
  }
}
