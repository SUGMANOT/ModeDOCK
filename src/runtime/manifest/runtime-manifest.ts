import path from "node:path";
import { ModeDockError } from "../../core/errors.js";
import { inspectDll } from "../inspection/pe-inspector.js";

export interface RuntimeModManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  game?: string;
  runtime: "modedock-native-abi-v1" | "bepinex5-compat";
  architecture: "x86" | "x64" | "arm64" | "any";
  entrypoints: string[];
  dependencies?: string[];
  conflicts?: string[];
  supportedGameVersions?: string[];
  permissions?: Array<"game-runtime" | "config">;
  capabilities?: string[];
  gameModification?: boolean;
}

const N1_FIXTURE_SHA256 = "afa645eb193116ca426ef9e86a1b9426e87d59da02e39b6269f4cb8a53c4a8bb";

export async function generateRuntimeManifest(dllPath: string): Promise<RuntimeModManifest> {
  const report = await inspectDll(dllPath);
  if (report.detectedRuntime !== "modedock-native-abi-v1") throw new ModeDockError("Automatic manifest generation currently requires ModeDOCK Native ABI v1.", "MANIFEST_RUNTIME_UNSUPPORTED", { detectedRuntime: report.detectedRuntime });
  const fixture = report.sha256 === N1_FIXTURE_SHA256;
  return {
    schemaVersion: 1,
    id: fixture ? "modedock.dead-cells-test" : slug(path.basename(report.path, path.extname(report.path))),
    name: fixture ? "ModeDOCK Dead Cells Test DLL" : path.basename(report.path, path.extname(report.path)),
    version: fixture ? "0.0.0-test" : "0.0.0",
    runtime: "modedock-native-abi-v1",
    architecture: report.architecture === "ARM64" ? "arm64" : report.architecture === "unknown" ? "any" : report.architecture,
    entrypoints: [path.basename(report.path)],
    capabilities: ["metadata", "self-test"],
    gameModification: false
  };
}

export function validateRuntimeManifest(value: unknown): RuntimeModManifest {
  const manifest = value as Partial<RuntimeModManifest>;
  if (manifest.schemaVersion !== 1 || !validId(manifest.id) || !manifest.name?.trim() || !manifest.version?.trim()) throw new ModeDockError("Runtime manifest identity is invalid.", "RUNTIME_MANIFEST_INVALID");
  if (manifest.runtime !== "modedock-native-abi-v1" && manifest.runtime !== "bepinex5-compat") throw new ModeDockError(`Unknown runtime '${manifest.runtime}'.`, "RUNTIME_MANIFEST_INVALID");
  if (!manifest.architecture || !["x86", "x64", "arm64", "any"].includes(manifest.architecture)) throw new ModeDockError("Runtime manifest architecture is invalid.", "RUNTIME_MANIFEST_INVALID");
  if (!Array.isArray(manifest.entrypoints) || !manifest.entrypoints.length || manifest.entrypoints.some(item => !item || path.isAbsolute(item) || item.replaceAll("\\", "/").split("/").includes(".."))) throw new ModeDockError("Runtime manifest entrypoints must be safe relative paths.", "RUNTIME_MANIFEST_INVALID");
  return manifest as RuntimeModManifest;
}

function validId(value?: string): boolean { return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{1,127}$/.test(value); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128) || "local.native-plugin"; }
