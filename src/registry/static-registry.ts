import type { PackageDescriptor, RegistryIndex, RegistryReference, ResolvedPackage } from "../types.js";
import { ModeDockCoreError } from "../errors.js";
import { sha256Bytes } from "../utils/hash.js";
import { compareVersions, sortVersionsDescending } from "../semver.js";
import { validateDescriptor, validateRegistry } from "../validation.js";
import { normalizeResource, readJsonResource, readResource, resolveResource } from "./resource.js";

export class StaticRegistry {
  private index?: RegistryIndex;
  private readonly descriptorCache = new Map<string, PackageDescriptor>();
  readonly reference: RegistryReference;

  constructor(reference: RegistryReference, private readonly fetchImpl: typeof fetch) {
    this.reference = { ...reference, location: normalizeResource(reference.location) };
  }

  async load(): Promise<RegistryIndex> {
    if (!this.index) this.index = validateRegistry(await readJsonResource<unknown>(this.reference.location, this.fetchImpl));
    return this.index;
  }

  async versions(packageId: string): Promise<string[]> {
    const index = await this.load();
    return sortVersionsDescending(Object.keys(index.packages[packageId] ?? {}));
  }

  async get(packageId: string, version: string): Promise<ResolvedPackage> {
    const key = `${packageId}@${version}`;
    let descriptor = this.descriptorCache.get(key);
    if (!descriptor) {
      const index = await this.load();
      const entry = index.packages[packageId]?.[version];
      if (!entry) throw new ModeDockCoreError(`Package not found: ${key}`, "PACKAGE_NOT_FOUND", { packageId, version, registry: this.reference.name });
      const descriptorLocation = resolveResource(this.reference.location, entry.descriptor);
      const bytes = await readResource(descriptorLocation, this.fetchImpl);
      if (entry.integrity) {
        const actual = sha256Bytes(bytes);
        if (actual !== entry.integrity) throw new ModeDockCoreError(`Registry descriptor hash mismatch: ${key}`, "REGISTRY_INTEGRITY_ERROR", { expected: entry.integrity, actual });
      }
      const raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      descriptor = validateDescriptor(raw);
      if (descriptor.manifest.id !== packageId || descriptor.manifest.version !== version) {
        throw new ModeDockCoreError(`Registry entry identity mismatch for ${key}.`, "REGISTRY_IDENTITY_ERROR");
      }
      descriptor = {
        ...descriptor,
        artifacts: descriptor.artifacts.map(artifact => ({
          ...artifact,
          url: resolveResource(descriptorLocation, artifact.url)
        }))
      };
      this.descriptorCache.set(key, descriptor);
    }
    return { descriptor, registry: this.reference };
  }
}

export class RegistrySet {
  private readonly registries: StaticRegistry[];

  constructor(references: RegistryReference[], fetchImpl: typeof fetch) {
    this.registries = references.map(reference => new StaticRegistry(reference, fetchImpl));
  }

  async versions(packageId: string): Promise<Array<{ version: string; registry: StaticRegistry }>> {
    const seen = new Set<string>();
    const result: Array<{ version: string; registry: StaticRegistry }> = [];
    for (const registry of this.registries) {
      for (const version of await registry.versions(packageId)) {
        if (seen.has(version)) continue;
        seen.add(version);
        result.push({ version, registry });
      }
    }
    return result.sort((left, right) => compareVersions(right.version, left.version));
  }
}
