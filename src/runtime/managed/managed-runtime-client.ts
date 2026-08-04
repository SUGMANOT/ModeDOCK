import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeDockError } from "../../core/errors.js";

export interface ManagedRuntimeResult {
  status: "ok" | "partial-failure";
  plugins: Array<{ guid: string; state: "loaded" | "error"; error: string | null }>;
  logs: Array<{ timestamp: string; source: string; level: string; message: string }>;
  managerPersistent: boolean;
}

export class ManagedRuntimeClient {
  constructor(private readonly executable = defaultRuntimeExecutable(), private readonly timeoutMs = 10_000) {}

  async loadPlan(planFile: string): Promise<ManagedRuntimeResult> {
    if (process.platform !== "win32") throw new ModeDockError("The controlled managed runtime host is currently packaged for Windows x64.", "MANAGED_RUNTIME_UNAVAILABLE");
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ["load-plan", planFile], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; let settled = false;
      const finish = (operation: () => void) => { if (settled) return; settled = true; clearTimeout(timer); operation(); };
      const timer = setTimeout(() => { child.kill(); finish(() => reject(new ModeDockError("Managed runtime host timed out.", "MANAGED_RUNTIME_TIMEOUT"))); }, this.timeoutMs);
      child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length > 4_194_304) { child.kill(); finish(() => reject(new ModeDockError("Managed runtime output limit exceeded.", "MANAGED_RUNTIME_OUTPUT_LIMIT"))); } });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", error => finish(() => reject(new ModeDockError(`Managed runtime could not start: ${error.message}`, "MANAGED_RUNTIME_START_FAILED", { executable: this.executable }))));
      child.on("close", (code, signal) => finish(() => {
        let report: unknown;
        try { report = JSON.parse(stdout.trim()); }
        catch { reject(new ModeDockError("Managed runtime returned invalid JSON.", "MANAGED_RUNTIME_CRASHED", { code, signal, stderr })); return; }
        if (code !== 0) { reject(new ModeDockError(`Managed runtime failed with exit code ${code}.`, "MANAGED_RUNTIME_FAILED", { code, signal, stderr, report })); return; }
        const typed = report as Partial<ManagedRuntimeResult>;
        if ((typed.status !== "ok" && typed.status !== "partial-failure") || !Array.isArray(typed.plugins) || !Array.isArray(typed.logs)) { reject(new ModeDockError("Managed runtime returned an invalid report.", "INVALID_MANAGED_RUNTIME_REPORT", report)); return; }
        resolve(typed as ManagedRuntimeResult);
      }));
    });
  }
}

function defaultRuntimeExecutable(): string {
  const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(bundleRoot, "..", "managed", "bin", "runtime", "ModeDOCK.Runtime.exe");
}
