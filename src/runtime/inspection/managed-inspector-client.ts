import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeDockError } from "../../core/errors.js";

export interface ManagedInspectionReport {
  path: string;
  assembly: {
    name: string;
    version: string;
    targetFramework?: string;
    references: Array<{ name: string; version: string }>;
  };
  types: Array<{ name: string; baseType: string; attributes: string[] }>;
  plugins: Array<{
    typeName: string;
    guid?: string;
    name?: string;
    version?: string;
    processes: string[];
    dependencies: Array<{ guid: string; kind: "hard" | "soft" }>;
    incompatibilities: string[];
    usesBaseUnityPlugin: boolean;
    harmonyAttributes: string[];
  }>;
  signals: {
    bepInExReferences: boolean;
    harmonyReferences: boolean;
    unityEngineReferences: boolean;
    assemblyCSharpReferences: boolean;
    harmonyAttributes: string[];
  };
  classification: string;
  compatibility: "partial" | "unknown";
  compatibilityLevel: "B0";
  unsupportedSymbols: string[];
  notes: string[];
}

export class ManagedInspectorClient {
  constructor(
    private readonly executable = defaultExecutable(),
    private readonly timeoutMs = 10_000,
    private readonly maxOutputBytes = 4_194_304
  ) {}

  async inspect(dllPath: string): Promise<ManagedInspectionReport> {
    if (process.platform !== "win32") throw new ModeDockError("The managed inspector helper is currently packaged for Windows x64.", "MANAGED_INSPECTOR_UNAVAILABLE");
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ["inspect", dllPath, "--json"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let settled = false;
      const finish = (operation: () => void) => { if (settled) return; settled = true; clearTimeout(timer); operation(); };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new ModeDockError(`Managed inspector exceeded ${this.timeoutMs} ms.`, "MANAGED_INSPECTION_TIMEOUT")));
      }, this.timeoutMs);
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > this.maxOutputBytes) {
          child.kill();
          finish(() => reject(new ModeDockError("Managed inspector exceeded its output limit.", "MANAGED_INSPECTION_OUTPUT_LIMIT")));
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", error => finish(() => reject(new ModeDockError(`Managed inspector could not start: ${error.message}`, "MANAGED_INSPECTOR_START_FAILED", { executable: this.executable }))));
      child.on("close", (code, signal) => finish(() => {
        let payload: unknown;
        try { payload = JSON.parse(stdout.trim()); }
        catch {
          reject(new ModeDockError("Managed inspector returned invalid JSON.", "MANAGED_INSPECTOR_CRASHED", { code, signal, stderr }));
          return;
        }
        if (code !== 0) {
          reject(new ModeDockError(`Managed inspector failed with exit code ${code}.`, "MANAGED_INSPECTION_FAILED", { code, signal, stderr, payload }));
          return;
        }
        const report = payload as Partial<ManagedInspectionReport>;
        if (!report.assembly || !Array.isArray(report.plugins) || report.compatibilityLevel !== "B0") {
          reject(new ModeDockError("Managed inspector returned an invalid report.", "INVALID_MANAGED_INSPECTION", payload));
          return;
        }
        resolve(report as ManagedInspectionReport);
      }));
    });
  }
}

function defaultExecutable(): string {
  const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(bundleRoot, "..", "managed", "bin", "managed-inspector", "ModeDOCK.ManagedInspector.exe");
}
