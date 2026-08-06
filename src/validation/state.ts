import path from "node:path";
import { JOURNAL_SCHEMA_VERSION, LOCK_SCHEMA_VERSION, PROFILE_SCHEMA_VERSION, type ProfileDocument, type ProfileLockfile, type TransactionJournal } from "../types.js";
import { ValidationError } from "../errors.js";
import { normalizeRelative, pathKey } from "../utils/path.js";
import { parseVersion } from "../semver.js";
import { asRecord, expectArray, expectBoolean, expectInteger, expectIsoDate, expectNonEmpty, expectString, validateDependencyMap, validateId, validateOriginalBackup, validateResourceLocation, validateSha256 } from "./common.js";

export function validateProfile(value: unknown): ProfileDocument {
  const input = asRecord(value, "profile");
  if (input.schemaVersion !== PROFILE_SCHEMA_VERSION) throw new ValidationError("Unsupported profile schemaVersion.");
  const gameInput = asRecord(input.game, "game");
  const loader = gameInput.loader === undefined ? undefined : asRecord(gameInput.loader, "game.loader");
  const destinationsInput = asRecord(input.destinations, "destinations");
  const destinations: Record<string, string> = {};
  for (const [key, destination] of Object.entries(destinationsInput)) {
    destinations[validateId(key, "destination ID")] = normalizeRelative(expectString(destination, `destinations.${key}`));
  }
  if (!Object.keys(destinations).length) throw new ValidationError("Profile must define at least one destination.");
  const registries = expectArray(input.registries, "registries").map((value, index) => {
    const registry = asRecord(value, `registries[${index}]`);
    const location = expectString(registry.location, `registries[${index}].location`);
    validateResourceLocation(location, `registries[${index}].location`);
    return { name: validateId(registry.name, "registry name"), location };
  });
  const profile: ProfileDocument = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: validateId(input.id, "profile ID"),
    name: expectNonEmpty(input.name, "profile name"),
    game: {
      id: validateId(gameInput.id, "game ID"),
      rootDir: path.resolve(expectString(gameInput.rootDir, "game.rootDir")),
      platform: expectString(gameInput.platform, "game.platform") as NodeJS.Platform,
      architecture: expectString(gameInput.architecture, "game.architecture") as NodeJS.Architecture,
      ...(gameInput.version === undefined ? {} : { version: expectString(gameInput.version, "game.version") }),
      ...(loader === undefined ? {} : {
        loader: {
          id: validateId(loader.id, "loader ID"),
          ...(loader.version === undefined ? {} : { version: expectString(loader.version, "loader.version") })
        }
      })
    },
    destinations,
    requirements: validateDependencyMap(input.requirements, "requirements"),
    registries,
    createdAt: expectIsoDate(input.createdAt, "createdAt"),
    updatedAt: expectIsoDate(input.updatedAt, "updatedAt")
  };
  return profile;
}

export function validateLockfile(value: unknown): ProfileLockfile {
  const input = asRecord(value, "lockfile");
  if (input.schemaVersion !== LOCK_SCHEMA_VERSION) throw new ValidationError("Unsupported lockfile schemaVersion.");
  const profileId = validateId(input.profileId, "lock profile ID");
  expectIsoDate(input.generatedAt, "lock.generatedAt");
  validateDependencyMap(input.requirements, "lock.requirements");

  const order = expectArray(input.resolutionOrder, "lock.resolutionOrder").map((item, index) => validateId(item, `lock.resolutionOrder[${index}]`));
  if (new Set(order).size !== order.length) throw new ValidationError("lock.resolutionOrder contains duplicates.");

  const packagesInput = asRecord(input.packages, "lock.packages");
  for (const [packageId, rawPackage] of Object.entries(packagesInput)) {
    validateId(packageId, "lock package ID");
    const lockedPackage = asRecord(rawPackage, `lock.packages.${packageId}`);
    if (validateId(lockedPackage.id, "locked package ID") !== packageId) throw new ValidationError(`Lock package identity mismatch: ${packageId}.`);
    parseVersion(expectString(lockedPackage.version, `lock.packages.${packageId}.version`));
    expectNonEmpty(lockedPackage.name, `lock.packages.${packageId}.name`);
    validateSha256(lockedPackage.integrity, `lock.packages.${packageId}.integrity`);
    validateId(lockedPackage.registry, `lock.packages.${packageId}.registry`);
    validateDependencyMap(lockedPackage.dependencies, `lock.packages.${packageId}.dependencies`);
    for (const [index, rawArtifact] of expectArray(lockedPackage.artifacts, `lock.packages.${packageId}.artifacts`).entries()) {
      const artifact = asRecord(rawArtifact, `lock.packages.${packageId}.artifacts[${index}]`);
      normalizeRelative(expectString(artifact.source, "locked artifact source"));
      expectInteger(artifact.size, "locked artifact size", 0);
      validateSha256(artifact.sha256, "locked artifact sha256");
      validateResourceLocation(expectString(artifact.url, "locked artifact url"), "locked artifact url");
      validateId(artifact.destination, "locked artifact destination");
      normalizeRelative(expectString(artifact.targetRelative, "locked artifact targetRelative"));
    }
  }
  if (order.length !== Object.keys(packagesInput).length || order.some(packageId => !(packageId in packagesInput))) {
    throw new ValidationError("lock.resolutionOrder must contain every locked package exactly once.");
  }

  const filesInput = asRecord(input.files, "lock.files");
  for (const [key, rawFile] of Object.entries(filesInput)) {
    const file = asRecord(rawFile, `lock.files.${key}`);
    const targetRelative = normalizeRelative(expectString(file.targetRelative, `lock.files.${key}.targetRelative`));
    if (pathKey(targetRelative) !== key) throw new ValidationError(`Lock file key does not match target path: ${key}.`);
    const packageId = validateId(file.packageId, `lock.files.${key}.packageId`);
    const packageVersion = expectString(file.packageVersion, `lock.files.${key}.packageVersion`);
    parseVersion(packageVersion);
    const lockedPackage = asRecord(packagesInput[packageId], `lock package reference ${packageId}`);
    if (lockedPackage.version !== packageVersion) throw new ValidationError(`Lock file package version mismatch at ${targetRelative}.`);
    validateSha256(file.sha256, `lock.files.${key}.sha256`);
    expectInteger(file.size, `lock.files.${key}.size`, 0);
    expectBoolean(file.executable, `lock.files.${key}.executable`);
    if (file.original !== undefined) validateOriginalBackup(file.original, `lock.files.${key}.original`);
  }
  if (validateId(profileId, "lock profile ID") !== input.profileId) throw new ValidationError("Invalid lock profile ID.");
  return input as unknown as ProfileLockfile;
}

export function validateJournal(value: unknown): TransactionJournal {
  const input = asRecord(value, "transaction journal");
  if (input.schemaVersion !== JOURNAL_SCHEMA_VERSION) throw new ValidationError("Unsupported journal schemaVersion.");
  const id = validateId(input.id, "transaction ID");
  const profileId = validateId(input.profileId, "transaction profile ID");
  const gameRoot = path.resolve(expectString(input.gameRoot, "journal.gameRoot"));
  expectIsoDate(input.createdAt, "journal.createdAt");
  if (!["planned", "staged", "mutating", "applied", "rolled-back"].includes(expectString(input.state, "journal.state"))) {
    throw new ValidationError("Invalid journal state.");
  }
  if (input.previousLock !== undefined && validateLockfile(input.previousLock).profileId !== profileId) throw new ValidationError("Journal previous lock belongs to another profile.");
  const previousProfile = validateProfile(input.previousProfile);
  const nextProfile = validateProfile(input.nextProfile);
  const nextLock = validateLockfile(input.nextLock);
  if (previousProfile.id !== profileId || nextProfile.id !== profileId || nextLock.profileId !== profileId) {
    throw new ValidationError("Journal profile identity mismatch.");
  }
  if (path.resolve(previousProfile.game.rootDir) !== gameRoot || path.resolve(nextProfile.game.rootDir) !== gameRoot) {
    throw new ValidationError("Journal game root differs from profile game root.");
  }
  for (const [index, rawEntry] of expectArray(input.files, "journal.files").entries()) {
    const entry = asRecord(rawEntry, `journal.files[${index}]`);
    const operation = asRecord(entry.operation, `journal.files[${index}].operation`);
    const action = expectString(operation.action, "operation.action");
    if (!["write", "remove", "restore-original"].includes(action)) throw new ValidationError(`Invalid journal operation action: ${action}.`);
    const targetRelative = normalizeRelative(expectString(operation.targetRelative, "operation.targetRelative"));
    const destination = path.resolve(expectString(operation.destination, "operation.destination"));
    const expectedDestination = path.resolve(gameRoot, targetRelative === "." ? "" : targetRelative);
    const difference = path.relative(gameRoot, expectedDestination);
    if (difference.startsWith("..") || path.isAbsolute(difference) || destination !== expectedDestination) {
      throw new ValidationError(`Journal destination escaped the game root: ${targetRelative}.`);
    }
    if (operation.packageId !== undefined) validateId(operation.packageId, "operation.packageId");
    if (operation.packageVersion !== undefined) parseVersion(expectString(operation.packageVersion, "operation.packageVersion"));
    if (action === "write") {
      validateResourceLocation(expectString(operation.sourceUrl, "operation.sourceUrl"), "operation.sourceUrl");
      validateSha256(operation.sourceSha256, "operation.sourceSha256");
      expectInteger(operation.sourceSize, "operation.sourceSize", 0);
      if (operation.executable !== undefined) expectBoolean(operation.executable, "operation.executable");
    }
    const precondition = asRecord(operation.precondition, "operation.precondition");
    const preconditionKind = expectString(precondition.kind, "operation.precondition.kind");
    if (preconditionKind === "sha256") validateSha256(precondition.sha256, "operation.precondition.sha256");
    else if (preconditionKind !== "absent") throw new ValidationError("Invalid operation precondition.");
    if (operation.original !== undefined) validateOriginalBackup(operation.original, "operation.original");
    if (operation.preserveOriginal !== undefined) validateOriginalBackup(operation.preserveOriginal, "operation.preserveOriginal");
    if (entry.beforeSnapshot !== undefined) expectString(entry.beforeSnapshot, "journal.beforeSnapshot");
    if (entry.stagedPayload !== undefined) expectString(entry.stagedPayload, "journal.stagedPayload");
    if (!["planned", "snapshotted", "applied"].includes(expectString(entry.state, "journal file state"))) {
      throw new ValidationError("Invalid journal file state.");
    }
  }
  if (id !== input.id) throw new ValidationError("Invalid transaction ID.");
  return input as unknown as TransactionJournal;
}
