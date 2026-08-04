import { ModeDockError } from "../../core/errors.js";
import { ManagedInspectorClient, type ManagedInspectionReport } from "../inspection/managed-inspector-client.js";
import { buildPluginGraph, type ManagedPluginCandidate, type PluginGraphResult } from "./plugin-graph.js";

export interface ManagedRuntimePaths {
  gameRootPath: string;
  gameDataPath: string;
  managedPath: string;
  bepInExRootPath: string;
  pluginPath: string;
  configPath: string;
  cachePath: string;
  processName: string;
  executablePath: string;
}

export interface ManagedLoadPlan {
  paths: ManagedRuntimePaths;
  logPath: string;
  plugins: Array<{ location: string; typeName: string; guid: string; name: string; version: string }>;
}

export interface ManagedPlanningResult {
  plan: ManagedLoadPlan;
  inspections: ManagedInspectionReport[];
  filtered: PluginGraphResult["filtered"];
  warnings: string[];
}

/** Builds an executable plan only from metadata reports produced without loading plugin code. */
export class ManagedPluginPlanner {
  constructor(private readonly inspector = new ManagedInspectorClient()) {}

  async createPlan(files: string[], paths: ManagedRuntimePaths, logPath: string): Promise<ManagedPlanningResult> {
    if (!files.length) throw new ModeDockError("At least one managed plugin is required.", "PLUGIN_LIST_EMPTY");
    const inspections = await Promise.all(files.map(file => this.inspector.inspect(file)));
    const candidates: ManagedPluginCandidate[] = [];
    for (let index = 0; index < inspections.length; index += 1) {
      const inspection = inspections[index]!;
      const file = files[index]!;
      const unsupportedHarmony = inspection.unsupportedSymbols.filter(symbol => symbol.startsWith("HarmonyLib."));
      if (unsupportedHarmony.length) throw new ModeDockError(`Plugin assembly '${inspection.assembly.name}' uses unsupported Harmony APIs: ${unsupportedHarmony.join(", ")}.`, "UNSUPPORTED_HARMONY_API", { file, symbols: unsupportedHarmony });
      if (!inspection.plugins.length) throw new ModeDockError(`Assembly '${inspection.assembly.name}' has no BepInPlugin entry point.`, "PLUGIN_METADATA_MISSING", { file });
      for (const plugin of inspection.plugins) {
        if (!plugin.guid?.trim() || !plugin.name?.trim() || !plugin.version?.trim())
          throw new ModeDockError(`Plugin type '${plugin.typeName}' has incomplete BepInPlugin metadata.`, "PLUGIN_METADATA_INVALID", { file, plugin });
        candidates.push({ file, inspection, plugin });
      }
    }

    const graph = buildPluginGraph(candidates, paths.processName);
    return {
      plan: {
        paths,
        logPath,
        plugins: graph.ordered.map(candidate => ({
          location: candidate.file,
          typeName: candidate.plugin.typeName,
          guid: candidate.plugin.guid!,
          name: candidate.plugin.name!,
          version: candidate.plugin.version!
        }))
      },
      inspections,
      filtered: graph.filtered,
      warnings: graph.warnings
    };
  }
}
