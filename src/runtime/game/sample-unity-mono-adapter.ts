import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeDockError } from "../../core/errors.js";
import { exists, sha256File } from "../../services/filesystem/safe-fs.js";
import type { InstallPlan, PlannedFile } from "../../types/index.js";
import { inspectDll } from "../inspection/pe-inspector.js";
import type { GameAdapter, GameInstallation, GameInspection, LaunchInput, LaunchPlan, LaunchResult, RuntimeKind, ValidationResult } from "./types.js";

interface FixtureMarker { schemaVersion: 1; fixtureId: "modedock.controlled-unity-mono.v1"; gameVersion: "1.0.0-test"; unityVersion: string; executable: string; executableSha256: string }

export class SampleUnityMonoAdapter implements GameAdapter {
  readonly id = "sample-unity-mono";
  readonly version = "1.0.0";
  constructor(private readonly assetRoot = defaultAssetRoot()) {}
  async detectInstallations(): Promise<GameInstallation[]> { return []; }
  supportsRuntime(runtime: RuntimeKind): boolean { return runtime === "bepinex5-compat"; }

  async inspect(installation: GameInstallation): Promise<GameInspection> {
    const markerPath = path.join(installation.rootDir, "moddock-fixture.json");
    const reasons: string[] = [];
    let marker: FixtureMarker | undefined;
    try { marker = JSON.parse(await readFile(markerPath, "utf8")) as FixtureMarker; }
    catch { reasons.push("controlled fixture marker is missing or corrupt"); }
    if (marker && (marker.schemaVersion !== 1 || marker.fixtureId !== "modedock.controlled-unity-mono.v1" || marker.gameVersion !== "1.0.0-test")) reasons.push("fixture identity or version is not allowlisted");
    const executable = path.join(installation.rootDir, marker?.executable ?? installation.executable);
    let architecture: GameInspection["architecture"] = "unknown";
    let executableSha256: string | undefined;
    if (!await exists(executable)) reasons.push("game executable is missing");
    else {
      try {
        const pe = await inspectDll(executable); architecture = pe.architecture === "ARM64" ? "arm64" : pe.architecture; executableSha256 = pe.sha256;
        if (marker && pe.sha256 !== marker.executableSha256) reasons.push("game executable hash is not allowlisted");
        if (pe.architecture !== "x64") reasons.push(`unsupported architecture: ${pe.architecture}`);
      } catch (error) { reasons.push(`executable inspection failed: ${(error as Error).message}`); }
    }
    const dataPath = path.join(installation.rootDir, "ModeDOCK.SampleUnityMonoGame_Data");
    const managedPath = path.join(dataPath, "Managed");
    const assemblyCSharpPath = path.join(managedPath, "Assembly-CSharp.dll");
    if (!await exists(assemblyCSharpPath)) reasons.push("controlled Managed/Assembly-CSharp.dll is missing");
    return {
      supported: reasons.length === 0, reasons, executable, ...(executableSha256 ? { executableSha256 } : {}), architecture,
      engine: "unity-controlled-harness", runtime: "mono-controlled-harness", gameVersion: marker?.gameVersion ?? "unknown",
      unityVersion: marker?.unityVersion ?? "unknown", managedPath, assemblyCSharpPath, knownProtectionStatus: "not-applicable", adapterVersion: this.version
    };
  }

  async createLaunchPlan(input: LaunchInput): Promise<LaunchPlan> {
    return { ...input, adapterId: this.id, executablePath: input.inspection.executable, bootstrapRoot: path.join(input.installation.rootDir, ".moddock", "runtime") };
  }
  async validateLaunch(plan: LaunchPlan): Promise<ValidationResult> {
    const errors = [...plan.inspection.reasons];
    if (!plan.inspection.supported) errors.unshift("installation is not an allowlisted controlled target");
    if (!this.supportsRuntime(plan.runtime)) errors.push(`runtime '${plan.runtime}' is not supported`);
    if (!await exists(path.join(plan.bootstrapRoot, "ModeDOCK.Runtime.exe"))) errors.push("ModeDOCK runtime bootstrap is not installed");
    if (!await exists(plan.runtimePlanFile)) errors.push("runtime load plan is missing");
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  async installBootstrap(plan: LaunchPlan): Promise<InstallPlan> {
    const files = await this.bootstrapFiles(plan);
    return {
      id: randomUUID().replaceAll("-", ""), target: plan.installation.target, sourcePath: this.assetRoot, sourceName: "ModeDOCK Runtime",
      sourceType: "folder", name: "ModeDOCK Runtime", adapterId: this.id, files,
      overwrites: files.filter(file => file.exists).map(file => file.targetRelative), conflicts: [], totalBytes: files.reduce((sum, file) => sum + file.size, 0)
    };
  }
  async uninstallBootstrap(plan: LaunchPlan): Promise<InstallPlan> { return this.installBootstrap(plan); }

  async launch(plan: LaunchPlan): Promise<LaunchResult> {
    const validation = await this.validateLaunch(plan);
    if (!validation.valid) throw new ModeDockError(`Launch validation failed:\n- ${validation.errors.join("\n- ")}`, "RUNTIME_LAUNCH_INVALID", validation);
    return new Promise((resolve, reject) => {
      const child = spawn(plan.executablePath, [], {
        cwd: plan.installation.rootDir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, MODDOCK_RUNTIME_PLAN: plan.runtimePlanFile, MODDOCK_RUNTIME_EXE: path.join(plan.bootstrapRoot, "ModeDOCK.Runtime.exe") }
      });
      let stdout = ""; let stderr = ""; let settled = false;
      const finish = (action: () => void) => { if (settled) return; settled = true; clearTimeout(timer); action(); };
      const timer = setTimeout(() => { child.kill(); finish(() => reject(new ModeDockError("Controlled game launch timed out.", "RUNTIME_LAUNCH_TIMEOUT"))); }, 30_000);
      child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length > 4_194_304) child.kill(); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", error => finish(() => reject(new ModeDockError(`Controlled game failed to start: ${error.message}`, "RUNTIME_LAUNCH_FAILED"))));
      child.on("close", (exitCode, signal) => finish(() => resolve({ exitCode: exitCode ?? -1, signal, stdout, stderr })));
    });
  }

  private async bootstrapFiles(plan: LaunchPlan): Promise<PlannedFile[]> {
    const names = (await readdir(this.assetRoot)).filter(name => !name.toLowerCase().endsWith(".pdb"));
    if (!names.includes("ModeDOCK.Runtime.exe") || !names.includes("BepInEx.dll") || !names.includes("0Harmony.dll")) throw new ModeDockError("Packaged runtime assets are incomplete.", "RUNTIME_ASSETS_MISSING", { assetRoot: this.assetRoot, names });
    const files: PlannedFile[] = await Promise.all(names.map(async name => {
      const sourcePath = path.join(this.assetRoot, name); const info = await stat(sourcePath);
      if (!info.isFile()) throw new ModeDockError(`Runtime asset is not a file: ${name}.`, "RUNTIME_ASSET_INVALID");
      const destination = path.join(plan.bootstrapRoot, name); const targetRelative = path.relative(plan.installation.rootDir, destination).replaceAll("\\", "/");
      return { relative: name, sourcePath, size: info.size, sha256: await sha256File(sourcePath), destination, targetRelative, destinationKind: ".moddock/runtime", exists: await exists(destination) };
    }));
    const lockContent = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, adapter: { id: this.id, version: this.version }, gameVersion: plan.inspection.gameVersion, executableSha256: plan.inspection.executableSha256, runtimeCompatibility: { bepInEx: "B2", harmony: "H2", native: "N1" } }, null, 2) + "\n");
    const lockDestination = path.join(plan.installation.rootDir, ".moddock", "runtime-lock.json");
    files.push({ relative: "runtime-lock.json", content: lockContent, size: lockContent.byteLength, sha256: createHash("sha256").update(lockContent).digest("hex"), destination: lockDestination, targetRelative: ".moddock/runtime-lock.json", destinationKind: ".moddock", exists: await exists(lockDestination) });
    return files;
  }
}

function defaultAssetRoot(): string { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "managed", "bin", "runtime"); }
