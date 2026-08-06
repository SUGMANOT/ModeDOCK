import { mkdir, readdir, rm } from "node:fs/promises";
import type { ChallengeSession } from "../types.js";
import { validateChallengeSession } from "../validation.js";
import type { CorePaths } from "../storage/paths.js";
import { readJsonFile, writeJsonFile } from "../storage/json.js";

export class ChallengeStore {
  constructor(private readonly paths: CorePaths) {}

  async list(): Promise<ChallengeSession[]> {
    try {
      const entries = await readdir(this.paths.challengeSessions, { withFileTypes: true });
      const result: ChallengeSession[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          result.push(await this.get(entry.name));
        } catch {
          // Listing remains available even when a damaged session requires manual inspection.
        }
      }
      return result.sort((left, right) => left.id.localeCompare(right.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async get(sessionId: string): Promise<ChallengeSession> {
    return validateChallengeSession(await readJsonFile<unknown>(this.paths.challengeSession(sessionId)));
  }

  async save(session: ChallengeSession): Promise<void> {
    const validated = validateChallengeSession(session);
    await mkdir(this.paths.challengeSessionDir(validated.id), { recursive: true });
    await writeJsonFile(this.paths.challengeSession(validated.id), validated);
  }

  async remove(sessionId: string): Promise<void> {
    await rm(this.paths.challengeSessionDir(sessionId), { recursive: true, force: true });
  }
}
