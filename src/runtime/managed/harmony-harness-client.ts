import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeDockError } from "../../core/errors.js";

export interface HarmonyHarnessResult { status: "ok"; level: "H4"; tests: number; patchedMethods: number }

export class HarmonyHarnessClient {
  constructor(private readonly executable = defaultExecutable(), private readonly timeoutMs = 10_000) {}
  async run(): Promise<HarmonyHarnessResult> {
    if (process.platform !== "win32") throw new ModeDockError("The Harmony controlled harness is currently packaged for Windows x64.", "HARMONY_HARNESS_UNAVAILABLE");
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; let settled = false;
      const finish = (action: () => void) => { if (settled) return; settled = true; clearTimeout(timer); action(); };
      const timer = setTimeout(() => { child.kill(); finish(() => reject(new ModeDockError("Harmony harness timed out.", "HARMONY_HARNESS_TIMEOUT"))); }, this.timeoutMs);
      child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length > 1_048_576) { child.kill(); finish(() => reject(new ModeDockError("Harmony harness output limit exceeded.", "HARMONY_HARNESS_OUTPUT_LIMIT"))); } });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", error => finish(() => reject(new ModeDockError(`Harmony harness could not start: ${error.message}`, "HARMONY_HARNESS_START_FAILED"))));
      child.on("close", (code, signal) => finish(() => {
        let payload: unknown;
        try { payload = JSON.parse(stdout.trim()); }
        catch { reject(new ModeDockError("Harmony harness returned invalid JSON.", "HARMONY_HARNESS_CRASHED", { code, signal, stderr })); return; }
        const result = payload as Partial<HarmonyHarnessResult>;
        if (code !== 0 || result.status !== "ok" || result.level !== "H4" || typeof result.tests !== "number") { reject(new ModeDockError("Harmony H1-H4 verification failed.", "HARMONY_HARNESS_FAILED", { code, signal, stderr, payload })); return; }
        resolve(result as HarmonyHarnessResult);
      }));
    });
  }
}

function defaultExecutable(): string {
  const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(bundleRoot, "..", "managed", "bin", "harmony-harness", "ModeDOCK.HarmonyHarness.exe");
}
