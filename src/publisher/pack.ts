import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { PackageArtifact, PackageDescriptor, PublisherOptions } from "../types.js";
import { PACKAGE_SCHEMA_VERSION } from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { descriptorIntegrity, validateManifest } from "../validation.js";
import { sha256File } from "../utils/hash.js";
import { normalizeRelative, resolveInside } from "../utils/path.js";
import { writeJsonFile } from "../storage/json.js";

export async function packMod(sourceDirectory: string, registryRoot: string, options: PublisherOptions = {}): Promise<{ descriptor: PackageDescriptor; descriptorPath: string }> {
  const sourceRoot = path.resolve(sourceDirectory);
  const manifestPath = path.join(sourceRoot, "moddock.json");
  let manifestRaw: unknown;
  try { manifestRaw = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) { throw new ModeDockCoreError(`Could not read package manifest: ${manifestPath}`, "MANIFEST_READ_FAILED", undefined, { cause: error as Error }); }
  const manifest = validateManifest(manifestRaw);
  const packageRoot = path.join(path.resolve(registryRoot), "packages", manifest.id, manifest.version);
  const filesRoot = path.join(packageRoot, "files");
  await mkdir(filesRoot, { recursive: true });
  const artifacts: PackageArtifact[] = [];
  const copied = new Set<string>();
  for (const rule of manifest.files) {
    const sourceRelative = normalizeRelative(rule.source);
    if (copied.has(sourceRelative.toLowerCase())) continue;
    copied.add(sourceRelative.toLowerCase());
    const sourceFile = resolveInside(sourceRoot, sourceRelative);
    const info = await stat(sourceFile).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ModeDockCoreError(`Package source file is missing: ${sourceRelative}`, "PACKAGE_FILE_MISSING");
      throw error;
    });
    if (!info.isFile()) throw new ModeDockCoreError(`Package source is not a regular file: ${sourceRelative}`, "INVALID_PACKAGE_FILE");
    const destination = resolveInside(filesRoot, sourceRelative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourceFile, destination);
    const relativeUrl = `files/${sourceRelative}`;
    const url = options.baseUrl
      ? new URL(`packages/${encodeURIComponent(manifest.id)}/${encodeURIComponent(manifest.version)}/${relativeUrl}`, ensureTrailingSlash(options.baseUrl)).href
      : relativeUrl;
    artifacts.push({ source: sourceRelative, size: info.size, sha256: await sha256File(destination), url });
  }
  const partial = { manifest, artifacts };
  const descriptor: PackageDescriptor = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    manifest,
    artifacts,
    integrity: descriptorIntegrity(partial)
  };
  const descriptorPath = path.join(packageRoot, "descriptor.json");
  await writeJsonFile(descriptorPath, descriptor);
  return { descriptor, descriptorPath };
}

function ensureTrailingSlash(value: string): string { return value.endsWith("/") ? value : `${value}/`; }
