import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeDockError } from "../../core/errors.js";

export interface NativeProbeResult {
  apiVersion: number;
  name: string;
  description: string;
  ping: number;
  status: "ok";
  executed: true;
}

export interface NativeProbeClientOptions {
  executable?: string;
  prefixArgs?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export class NativeProbeClient {
  private readonly executable: string;
  private readonly prefixArgs: string[];
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: NativeProbeClientOptions = {}) {
    const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
    this.executable = options.executable ?? path.resolve(bundleRoot, "..", "native", "bin", "moddock-native-probe.exe");
    this.prefixArgs = options.prefixArgs ?? [];
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1_048_576;
  }

  async probe(dllPath: string): Promise<NativeProbeResult> {
    if (process.platform !== "win32" && !this.prefixArgs.length)
      throw new ModeDockError("The native ABI probe is currently available only on Windows.", "PROBE_UNAVAILABLE");
    const args = [...this.prefixArgs, dllPath, "--json", "--execute-probe"];
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;
      const finish = (operation: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        operation();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new ModeDockError(`Native probe exceeded ${this.timeoutMs} ms and was terminated.`, "PROBE_TIMEOUT", { timeoutMs: this.timeoutMs })));
      }, this.timeoutMs);
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > this.maxOutputBytes) {
          child.kill();
          finish(() => reject(new ModeDockError("Native probe exceeded its output limit and was terminated.", "PROBE_OUTPUT_LIMIT")));
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", error => finish(() => reject(new ModeDockError(`Native probe could not start: ${error.message}`, "PROBE_START_FAILED", { executable: this.executable }))));
      child.on("close", (code, signal) => finish(() => {
        let payload: unknown;
        try { payload = JSON.parse(stdout.trim()); }
        catch {
          reject(new ModeDockError("Native probe returned invalid JSON or crashed before producing a result.", "PROBE_CRASHED", { code, signal, stderr }));
          return;
        }
        if (code !== 0) {
          reject(new ModeDockError(`Native probe failed with exit code ${code}.`, "PROBE_FAILED", { code, signal, stderr, payload }));
          return;
        }
        const result = payload as Partial<NativeProbeResult>;
        if (result.status !== "ok" || result.executed !== true || result.apiVersion !== 1 || result.ping !== 1 || typeof result.name !== "string" || typeof result.description !== "string") {
          reject(new ModeDockError("Native probe response did not satisfy ABI v1.", "INVALID_PROBE_RESPONSE", payload));
          return;
        }
        resolve(result as NativeProbeResult);
      }));
    });
  }
}
