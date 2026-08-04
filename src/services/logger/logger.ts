import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LogLevel } from "../../types/index.js";

const priority: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  constructor(private readonly directory: string, private readonly level: LogLevel, private readonly verbose = false) {}

  async write(level: LogLevel, event: string, data: Record<string, unknown> = {}): Promise<void> {
    if (priority[level] > priority[this.level]) return;
    const sanitized = this.sanitize(data);
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...sanitized });
    await mkdir(this.directory, { recursive: true });
    await appendFile(path.join(this.directory, "moddock.log"), `${line}\n`, "utf8");
    if (this.verbose) process.stderr.write(`[${level}] ${event} ${JSON.stringify(sanitized)}\n`);
  }

  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    const home = os.homedir();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      typeof item === "string" ? item.replaceAll(home, "~") : item]));
  }
}
