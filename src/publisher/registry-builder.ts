import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PublisherOptions, RegistryIndex } from "../types.js";
import { REGISTRY_SCHEMA_VERSION } from "../types.js";
import { validateDescriptor } from "../validation.js";
import { sha256File } from "../utils/hash.js";
import { writeJsonFile } from "../storage/json.js";

export async function buildRegistry(
  registryRoot: string,
  outputFile = path.join(registryRoot, "registry.json"),
  name = "ModeDOCK Registry",
  options: PublisherOptions = {}
): Promise<RegistryIndex> {
  const root = path.resolve(registryRoot);
  const packagesRoot = path.join(root, "packages");
  const packages: RegistryIndex["packages"] = {};
  for (const packageEntry of await safeReadDirectories(packagesRoot)) {
    const packageId = packageEntry.name;
    for (const versionEntry of await safeReadDirectories(path.join(packagesRoot, packageId))) {
      const descriptorPath = path.join(packagesRoot, packageId, versionEntry.name, "descriptor.json");
      const descriptor = validateDescriptor(JSON.parse(await readFile(descriptorPath, "utf8")) as unknown);
      if (descriptor.manifest.id !== packageId || descriptor.manifest.version !== versionEntry.name) continue;
      const relative = path.relative(path.dirname(path.resolve(outputFile)), descriptorPath).replaceAll(path.sep, "/");
      const descriptorLocation = options.baseUrl
        ? new URL(`packages/${encodeURIComponent(packageId)}/${encodeURIComponent(versionEntry.name)}/descriptor.json`, ensureTrailingSlash(options.baseUrl)).href
        : relative.startsWith(".") ? relative : `./${relative}`;
      (packages[packageId] ??= {})[versionEntry.name] = {
        descriptor: descriptorLocation,
        integrity: await sha256File(descriptorPath)
      };
    }
  }
  const index: RegistryIndex = { schemaVersion: REGISTRY_SCHEMA_VERSION, name, packages };
  await writeJsonFile(path.resolve(outputFile), index);
  return index;
}

async function safeReadDirectories(directory: string): Promise<Array<{ name: string }>> {
  try { return (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name })); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

function ensureTrailingSlash(value: string): string { return value.endsWith("/") ? value : `${value}/`; }
