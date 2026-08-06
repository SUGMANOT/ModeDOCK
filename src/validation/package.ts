import path from "node:path";
import { PACKAGE_SCHEMA_VERSION, REGISTRY_SCHEMA_VERSION, type ModPackageManifest, type PackageArtifact, type PackageDescriptor, type RegistryIndex } from "../types.js";
import { ValidationError } from "../errors.js";
import { normalizeRelative } from "../utils/path.js";
import { parseVersion } from "../semver.js";
import { sha256Object } from "../utils/hash.js";
import { SHA256_PATTERN, asRecord, expectArray, expectBoolean, expectInteger, expectNonEmpty, expectString, expectStringArray, validateDependencyMap, validateId, validateResourceLocation } from "./common.js";

export function validateManifest(value: unknown): ModPackageManifest {
  const input = asRecord(value, "package manifest");
  if (input.schemaVersion !== PACKAGE_SCHEMA_VERSION) throw new ValidationError("Unsupported package schemaVersion.");
  const id = validateId(input.id, "package ID");
  const version = expectString(input.version, "version");
  parseVersion(version);
  const name = expectNonEmpty(input.name, "name");
  const gameInput = asRecord(input.game, "game");
  const game: ModPackageManifest["game"] = { id: validateId(gameInput.id, "game ID") };
  if (gameInput.version !== undefined) game.version = expectString(gameInput.version, "game.version");

  const filesInput = expectArray(input.files, "files");
  if (!filesInput.length) throw new ValidationError("A package must contain at least one file rule.");
  const seenTargets = new Set<string>();
  const files = filesInput.map((item, index) => {
    const rule = asRecord(item, `files[${index}]`);
    const source = normalizeRelative(expectString(rule.source, `files[${index}].source`));
    const destination = validateId(rule.destination, `files[${index}].destination`);
    const target = rule.target === undefined ? undefined : normalizeRelative(expectString(rule.target, `files[${index}].target`));
    const targetKey = `${destination}/${target ?? path.posix.basename(source)}`.toLowerCase();
    if (seenTargets.has(targetKey)) throw new ValidationError(`Duplicate package target: ${targetKey}`);
    seenTargets.add(targetKey);
    return {
      source,
      destination,
      ...(target === undefined ? {} : { target }),
      ...(rule.executable === undefined ? {} : { executable: expectBoolean(rule.executable, `files[${index}].executable`) })
    };
  });

  const result: ModPackageManifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    id,
    version,
    name,
    game,
    files
  };
  if (input.description !== undefined) result.description = expectString(input.description, "description");
  if (input.authors !== undefined) result.authors = expectStringArray(input.authors, "authors");
  if (input.homepage !== undefined) result.homepage = expectString(input.homepage, "homepage");
  if (input.license !== undefined) result.license = expectString(input.license, "license");
  if (input.scope !== undefined) {
    if (!new Set(["client", "server", "both"]).has(String(input.scope))) throw new ValidationError("scope must be client, server, or both.");
    result.scope = input.scope as "client" | "server" | "both";
  }
  if (input.loader !== undefined) {
    const loaderInput = asRecord(input.loader, "loader");
    result.loader = { id: validateId(loaderInput.id, "loader ID") };
    if (loaderInput.version !== undefined) result.loader.version = expectString(loaderInput.version, "loader.version");
  }
  if (input.platforms !== undefined) result.platforms = expectStringArray(input.platforms, "platforms") as NodeJS.Platform[];
  if (input.architectures !== undefined) result.architectures = expectStringArray(input.architectures, "architectures") as NodeJS.Architecture[];
  if (input.dependencies !== undefined) result.dependencies = validateDependencyMap(input.dependencies, "dependencies");
  if (input.optionalDependencies !== undefined) result.optionalDependencies = validateDependencyMap(input.optionalDependencies, "optionalDependencies");
  if (input.conflicts !== undefined) result.conflicts = validateDependencyMap(input.conflicts, "conflicts");
  return result;
}

export function validateDescriptor(value: unknown, verifyIntegrity = true): PackageDescriptor {
  const input = asRecord(value, "package descriptor");
  if (input.schemaVersion !== PACKAGE_SCHEMA_VERSION) throw new ValidationError("Unsupported descriptor schemaVersion.");
  const manifest = validateManifest(input.manifest);
  const artifactsInput = expectArray(input.artifacts, "artifacts");
  const artifacts = artifactsInput.map((item, index) => validateArtifact(item, index));
  const artifactSources = new Set(artifacts.map(item => item.source.toLowerCase()));
  for (const rule of manifest.files) {
    if (!artifactSources.has(rule.source.toLowerCase())) throw new ValidationError(`Manifest source has no artifact: ${rule.source}`);
  }
  const integrity = expectString(input.integrity, "integrity").toLowerCase();
  if (!SHA256_PATTERN.test(integrity)) throw new ValidationError("Descriptor integrity must be a SHA-256 hash.");
  const descriptor: PackageDescriptor = { schemaVersion: PACKAGE_SCHEMA_VERSION, manifest, artifacts, integrity };
  const calculated = descriptorIntegrity(descriptor);
  if (verifyIntegrity && calculated !== integrity) {
    throw new ValidationError("Package descriptor integrity mismatch.", { expected: integrity, actual: calculated });
  }
  return descriptor;
}

export function descriptorIntegrity(descriptor: Pick<PackageDescriptor, "manifest" | "artifacts">): string {
  return sha256Object({
    manifest: descriptor.manifest,
    artifacts: descriptor.artifacts.map(artifact => ({
      source: artifact.source,
      size: artifact.size,
      sha256: artifact.sha256,
      url: artifact.url
    }))
  });
}

function validateArtifact(value: unknown, index: number): PackageArtifact {
  const artifact = asRecord(value, `artifacts[${index}]`);
  const source = normalizeRelative(expectString(artifact.source, `artifacts[${index}].source`));
  const size = expectInteger(artifact.size, `artifacts[${index}].size`, 0);
  const sha256 = expectString(artifact.sha256, `artifacts[${index}].sha256`).toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) throw new ValidationError(`Invalid SHA-256 for artifact ${source}.`);
  const url = expectString(artifact.url, `artifacts[${index}].url`);
  validateResourceLocation(url, `artifacts[${index}].url`);
  return { source, size, sha256, url };
}

export function validateRegistry(value: unknown): RegistryIndex {
  const input = asRecord(value, "registry index");
  if (input.schemaVersion !== REGISTRY_SCHEMA_VERSION) throw new ValidationError("Unsupported registry schemaVersion.");
  const name = expectNonEmpty(input.name, "registry name");
  const packageInput = asRecord(input.packages, "packages");
  const packages: RegistryIndex["packages"] = {};
  for (const [packageId, rawVersions] of Object.entries(packageInput)) {
    validateId(packageId, "registry package ID");
    const versionsInput = asRecord(rawVersions, `packages.${packageId}`);
    const versions: Record<string, { descriptor: string; integrity?: string }> = {};
    for (const [version, rawEntry] of Object.entries(versionsInput)) {
      parseVersion(version);
      const entry = asRecord(rawEntry, `packages.${packageId}.${version}`);
      const descriptor = expectString(entry.descriptor, `packages.${packageId}.${version}.descriptor`);
      validateResourceLocation(descriptor, `packages.${packageId}.${version}.descriptor`);
      const normalized: { descriptor: string; integrity?: string } = { descriptor };
      if (entry.integrity !== undefined) {
        const integrity = expectString(entry.integrity, "integrity").toLowerCase();
        if (!SHA256_PATTERN.test(integrity)) throw new ValidationError(`Invalid descriptor integrity for ${packageId}@${version}.`);
        normalized.integrity = integrity;
      }
      versions[version] = normalized;
    }
    packages[packageId] = versions;
  }
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, name, packages };
}
