import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { DataPaths } from "../../services/filesystem/paths.js";

export class HistoryStore {
  constructor(private readonly paths: DataPaths) {}
  async add(operation: string, targetId?: string, itemId?: string, status = "success"): Promise<void> {
    await mkdir(path.dirname(this.paths.history), { recursive: true });
    await appendFile(this.paths.history, `${JSON.stringify({ timestamp: new Date().toISOString(), operation, targetId, itemId, status })}\n`);
  }
}
