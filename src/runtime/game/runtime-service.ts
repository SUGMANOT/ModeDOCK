import { constants } from "node:fs";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DiagnosticCheck } from "../../core/diagnostics/doctor-service.js";
import { ModeDockError } from "../../core/errors.js";
import type { InstallerService } from "../../core/installer/installer-service.js";
import type { InstallationStore } from "../../core/stores/installation-store.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import { exists } from "../../services/filesystem/safe-fs.js";
import { writeJson } from "../../services/config/json-file.js";
import type { InstallPlan, InstallationRecord, TargetProfile } from "../../types/index.js";
import { ManagedPluginPlanner, type ManagedLoadPlan, type ManagedRuntimePaths } from "../managed/managed-plugin-planner.js";
import { GameAdapterRegistry } from "./game-adapter-registry.js";
import type { GameAdapter, GameInstallation, GameInspection, LaunchPlan, LaunchResult } from "./types.js";

export interface RuntimeStatus {
  target: string;
  supported: boolean;
  adapter?: string;
  installed: boolean;
  inspection?: GameInspection;
  runtimeCompatibility: { bepInEx: "B2"; harmony: "H2"; native: "N1" };
  limitations: string[];
}

export class RuntimeService {
  constructor(
    private readonly paths: DataPaths,
    private readonly installations: InstallationStore,
    private readonly installer: InstallerService,
    private readonly adapters = new GameAdapterRegistry(),
    private readonly planner = new ManagedPluginPlanner()
  ) {}

  async status(target: TargetProfile): Promise<RuntimeStatus> {
    const record = await this.runtimeRecord(target);
    try {
      const { adapter, installation } = await this.adapters.resolve(target);
      return {
        target: target.id, supported: true, adapter: adapter.id, installed: record?.enabled === true,
        inspection: await adapter.inspect(installation), runtimeCompatibility: { bepInEx: "B2", harmony: "H2", native: "N1" },
        limitations: ["Only the allowlisted controlled Unity-Mono harness is supported.", "Harmony H2 is cooperative; arbitrary game-method detours are not implemented."]
      };
    } catch (error) {
      if (!(error instanceof ModeDockError) || error.code !== "GAME_RUNTIME_UNSUPPORTED") throw error;
      return { target: target.id, supported: false, installed: record?.enabled === true, runtimeCompatibility: { bepInEx: "B2", harmony: "H2", native: "N1" }, limitations: [error.message] };
    }
  }

  async install(target: TargetProfile, options: { dryRun?: boolean; force?: boolean } = {}): Promise<InstallPlan | InstallationRecord> {
    if (await this.runtimeRecord(target)) throw new ModeDockError("ModeDOCK Runtime is already installed for this target.", "RUNTIME_ALREADY_INSTALLED");
    const resolved = await this.adapters.resolve(target); const inspection = await resolved.adapter.inspect(resolved.installation);
    const launchPlan = await this.baseLaunchPlan(resolved.adapter, resolved.installation, inspection, target.id, [], path.join(this.paths.runtimePlans, `${target.id}.json`));
    const plan = await resolved.adapter.installBootstrap(launchPlan);
    if (options.dryRun) return plan;
    return this.installer.install(plan, { force: options.force });
  }

  async uninstall(target: TargetProfile, options: { dryRun?: boolean; force?: boolean } = {}): Promise<Array<{ action: string; path: string }> | InstallationRecord> {
    const record = await this.runtimeRecord(target);
    if (!record) throw new ModeDockError("ModeDOCK Runtime is not installed for this target.", "RUNTIME_NOT_INSTALLED");
    if (options.dryRun) return this.installer.preview(target, record, "remove");
    await this.installer.remove(target, record, options.force);
    return record;
  }

  async launch(target: TargetProfile, profile: string): Promise<LaunchResult> {
    if (!sameProfile(target, profile)) throw new ModeDockError(`Profile '${profile}' does not match target '${target.name}'.`, "PROFILE_MISMATCH");
    const record = await this.runtimeRecord(target);
    if (!record || !record.enabled || await this.installer.health(target, record) !== "active") throw new ModeDockError("ModeDOCK Runtime is not installed or failed integrity checks.", "RUNTIME_NOT_READY");
    const { adapter, installation } = await this.adapters.resolve(target); const inspection = await adapter.inspect(installation);
    const pluginFiles = await this.activeManagedPlugins(target, record.id);
    const planFile = path.join(this.paths.runtimePlans, `${target.id}-${safeProfile(profile)}.json`);
    const runtimePaths = this.runtimePaths(target, inspection);
    let managedPlan: ManagedLoadPlan;
    if (pluginFiles.length) managedPlan = (await this.planner.createPlan(pluginFiles, runtimePaths, path.join(this.paths.logs, `runtime-${target.id}.jsonl`))).plan;
    else managedPlan = { paths: runtimePaths, logPath: path.join(this.paths.logs, `runtime-${target.id}.jsonl`), plugins: [] };
    await mkdir(this.paths.runtimePlans, { recursive: true }); await writeJson(planFile, managedPlan);
    const launchPlan = await this.baseLaunchPlan(adapter, installation, inspection, profile, pluginFiles, planFile);
    const validation = await adapter.validateLaunch(launchPlan);
    if (!validation.valid) throw new ModeDockError(`Runtime launch is invalid:\n- ${validation.errors.join("\n- ")}`, "RUNTIME_LAUNCH_INVALID", validation);
    return adapter.launch(launchPlan);
  }

  async doctor(target: TargetProfile): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    let adapter: GameAdapter; let installation: GameInstallation; let inspection: GameInspection;
    try { ({ adapter, installation } = await this.adapters.resolve(target)); inspection = await adapter.inspect(installation); }
    catch (error) { return [{ name: "runtime-adapter", status: "error", message: (error as Error).message }]; }
    checks.push({ name: "runtime-adapter", status: inspection.supported ? "ok" : "error", message: `${adapter.id}@${adapter.version}` });
    checks.push({ name: "runtime-architecture", status: inspection.architecture === "x64" ? "ok" : "error", message: inspection.architecture });
    checks.push({ name: "runtime-engine", status: inspection.runtime === "mono-controlled-harness" ? "ok" : "error", message: `${inspection.engine}; ${inspection.runtime}; Unity ${inspection.unityVersion}` });
    checks.push({ name: "runtime-protection", status: inspection.knownProtectionStatus === "known-protection-detected" ? "error" : "ok", message: inspection.knownProtectionStatus });
    const record = await this.runtimeRecord(target);
    const health = record ? await this.installer.health(target, record) : "error";
    checks.push({ name: "runtime-bootstrap", status: record && health === "active" ? "ok" : "error", message: record ? health : "not installed" });
    try { await access(target.rootDir, constants.W_OK); checks.push({ name: "runtime-write-access", status: "ok", message: target.rootDir }); }
    catch { checks.push({ name: "runtime-write-access", status: "error", message: target.rootDir }); }
    const plugins = record ? await this.activeManagedPlugins(target, record.id) : [];
    if (plugins.length) {
      try { await this.planner.createPlan(plugins, this.runtimePaths(target, inspection), path.join(this.paths.logs, `runtime-${target.id}.jsonl`)); checks.push({ name: "runtime-plugin-graph", status: "ok", message: `${plugins.length} active managed plugin file(s)` }); }
      catch (error) { checks.push({ name: "runtime-plugin-graph", status: "error", message: `${error instanceof ModeDockError ? error.code : "PLUGIN_GRAPH_FAILED"}: ${(error as Error).message}` }); }
    } else checks.push({ name: "runtime-plugin-graph", status: "ok", message: "No active managed plugins." });
    checks.push(...await this.checkConfigs(path.join(target.rootDir, ".moddock", "config")));
    return checks;
  }

  private async baseLaunchPlan(adapter: GameAdapter, installation: GameInstallation, inspection: GameInspection, profile: string, pluginFiles: string[], runtimePlanFile: string): Promise<LaunchPlan> {
    return adapter.createLaunchPlan({ installation, inspection, runtime: "bepinex5-compat", profile, pluginFiles, runtimePlanFile });
  }
  private runtimePaths(target: TargetProfile, inspection: GameInspection): ManagedRuntimePaths {
    return {
      gameRootPath: target.rootDir, gameDataPath: path.dirname(inspection.managedPath), managedPath: inspection.managedPath,
      bepInExRootPath: path.join(target.rootDir, ".moddock"), pluginPath: path.join(target.rootDir, target.pluginsDir),
      configPath: path.join(target.rootDir, ".moddock", "config"), cachePath: path.join(target.rootDir, ".moddock", "cache"),
      processName: path.basename(inspection.executable), executablePath: inspection.executable
    };
  }
  private async runtimeRecord(target: TargetProfile): Promise<InstallationRecord | undefined> { return (await this.installations.list(target.id)).find(record => record.name === "ModeDOCK Runtime" && record.adapterId === "sample-unity-mono"); }
  private async activeManagedPlugins(target: TargetProfile, runtimeRecordId: string): Promise<string[]> {
    const files: string[] = [];
    for (const record of (await this.installations.list(target.id)).filter(item => item.enabled && item.id !== runtimeRecordId))
      for (const file of record.files) if (file.relative.toLowerCase().endsWith(".dll")) { const full = path.join(target.rootDir, file.relative); if (await exists(full)) files.push(full); }
    return [...new Set(files.map(file => path.resolve(file)))];
  }
  private async checkConfigs(directory: string): Promise<DiagnosticCheck[]> {
    if (!await exists(directory)) return [{ name: "runtime-config", status: "ok", message: "No config directory yet." }];
    const checks: DiagnosticCheck[] = [];
    for (const name of (await readdir(directory)).filter(file => file.toLowerCase().endsWith(".cfg"))) {
      const lines = (await readFile(path.join(directory, name), "utf8")).split(/\r?\n/);
      const malformed = lines.find(line => { const value = line.trim(); return value.length > 0 && !value.startsWith("#") && !(value.startsWith("[") && value.endsWith("]")) && !value.includes("="); });
      checks.push({ name: `runtime-config:${name}`, status: malformed ? "error" : "ok", message: malformed ? `Malformed line: ${malformed}` : "parseable" });
    }
    return checks.length ? checks : [{ name: "runtime-config", status: "ok", message: "No config files yet." }];
  }
}

function sameProfile(target: TargetProfile, selector: string): boolean { const value = selector.toLowerCase(); return value === target.id.toLowerCase() || value === target.name.toLowerCase(); }
function safeProfile(value: string): string { return value.replace(/[^a-z0-9._-]/gi, "-").slice(0, 80) || "default"; }
