import { ModeDockError } from "../../core/errors.js";
import type { ManagedInspectionReport } from "../inspection/managed-inspector-client.js";

export interface ManagedPluginCandidate {
  file: string;
  inspection: ManagedInspectionReport;
  plugin: ManagedInspectionReport["plugins"][number];
}

export interface PluginGraphResult {
  ordered: ManagedPluginCandidate[];
  filtered: Array<{ guid: string; reason: string }>;
  warnings: string[];
}

export function buildPluginGraph(candidates: ManagedPluginCandidate[], processName: string): PluginGraphResult {
  const byGuid = new Map<string, ManagedPluginCandidate>();
  const filtered: PluginGraphResult["filtered"] = [];
  for (const candidate of candidates) {
    const guid = candidate.plugin.guid?.trim();
    if (!guid) throw new ModeDockError(`Plugin type '${candidate.plugin.typeName}' has no valid BepInPlugin GUID.`, "PLUGIN_METADATA_INVALID", { file: candidate.file });
    const key = guid.toLowerCase();
    if (byGuid.has(key)) throw new ModeDockError(`Duplicate plugin GUID: ${guid}.`, "DUPLICATE_PLUGIN_GUID", { guid, files: [byGuid.get(key)!.file, candidate.file] });
    if (candidate.plugin.processes.length && !candidate.plugin.processes.some(value => sameProcess(value, processName))) {
      filtered.push({ guid, reason: `process-mismatch:${processName}` });
      continue;
    }
    byGuid.set(key, candidate);
  }

  for (const candidate of byGuid.values()) {
    const guid = candidate.plugin.guid!;
    for (const conflict of candidate.plugin.incompatibilities) {
      if (byGuid.has(conflict.toLowerCase()))
        throw new ModeDockError(`Plugin '${guid}' is incompatible with '${conflict}'.`, "PLUGIN_INCOMPATIBILITY", { guid, conflict });
    }
    for (const dependency of candidate.plugin.dependencies) {
      if (dependency.kind === "hard" && !byGuid.has(dependency.guid.toLowerCase()))
        throw new ModeDockError(`Plugin '${guid}' requires missing dependency '${dependency.guid}'.`, "PLUGIN_DEPENDENCY_MISSING", { guid, dependency: dependency.guid });
    }
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, Set<string>>();
  for (const key of byGuid.keys()) { incoming.set(key, 0); outgoing.set(key, new Set()); }
  for (const [key, candidate] of byGuid) {
    for (const dependency of candidate.plugin.dependencies) {
      const dependencyKey = dependency.guid.toLowerCase();
      if (!byGuid.has(dependencyKey) || outgoing.get(dependencyKey)!.has(key)) continue;
      outgoing.get(dependencyKey)!.add(key);
      incoming.set(key, incoming.get(key)! + 1);
    }
  }

  const queue = [...byGuid.keys()].filter(key => incoming.get(key) === 0).sort((a, b) => a.localeCompare(b));
  const ordered: ManagedPluginCandidate[] = [];
  while (queue.length) {
    const key = queue.shift()!;
    ordered.push(byGuid.get(key)!);
    for (const dependent of [...outgoing.get(key)!].sort((a, b) => a.localeCompare(b))) {
      incoming.set(dependent, incoming.get(dependent)! - 1);
      if (incoming.get(dependent) === 0) {
        queue.push(dependent);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }
  if (ordered.length !== byGuid.size) {
    const cycle = [...incoming].filter(([, count]) => count > 0).map(([key]) => byGuid.get(key)!.plugin.guid);
    throw new ModeDockError(`Plugin dependency cycle detected: ${cycle.join(" -> ")}.`, "PLUGIN_DEPENDENCY_CYCLE", { plugins: cycle });
  }
  return { ordered, filtered, warnings: [] };
}

function sameProcess(filter: string, processName: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\.exe$/i, "").toLowerCase();
  return normalize(filter) === normalize(processName);
}
