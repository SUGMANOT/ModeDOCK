import { spawn } from "node:child_process";
import { ModeDockError } from "../errors.js";
import { VERSION } from "../version.js";

export class UpdateService {
  async check(): Promise<{ current: string; latest: string; updateAvailable: boolean }> {
    let response: Response;
    try { response = await fetch("https://registry.npmjs.org/moddock/latest", { signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw new ModeDockError(`Could not contact npm: ${(error as Error).message}`, "NETWORK_ERROR"); }
    if (!response.ok) throw new ModeDockError(`npm returned HTTP ${response.status}.`, "NETWORK_ERROR");
    const latest = String((await response.json() as { version?: string }).version ?? "");
    if (!latest) throw new ModeDockError("npm response did not contain a version.", "NETWORK_ERROR");
    return { current: VERSION, latest, updateAvailable: compareVersions(latest, VERSION) > 0 };
  }

  async install(): Promise<number> {
    return new Promise((resolve, reject) => {
      const executable = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(executable, ["install", "--global", "moddock@latest"], { stdio: "inherit", shell: process.platform === "win32" });
      child.on("error", reject);
      child.on("exit", code => resolve(code ?? 1));
    });
  }
}

function compareVersions(a: string, b: string): number {
  const left = a.split(/[.-]/).slice(0, 3).map(Number);
  const right = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index++) if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
  return 0;
}
