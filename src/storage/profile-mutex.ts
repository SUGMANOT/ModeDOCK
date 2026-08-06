import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ProfileLockedError } from "../errors.js";

export class ProfileMutex {
  constructor(private readonly file: string, private readonly staleAfterMs = 30 * 60 * 1000) {}

  async acquire(): Promise<() => Promise<void>> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const handle = await open(this.file, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      await handle.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await this.isStale()) {
        await rm(this.file, { force: true });
        return this.acquire();
      }
      throw new ProfileLockedError(path.basename(path.dirname(this.file)), this.file);
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await rm(this.file, { force: true });
    };
  }

  private async isStale(): Promise<boolean> {
    try {
      const info = await stat(this.file);
      if (Date.now() - info.mtimeMs > this.staleAfterMs) return true;
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as { pid?: number };
      if (typeof parsed.pid !== "number") return true;
      try { process.kill(parsed.pid, 0); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
    } catch { return true; }
  }
}
