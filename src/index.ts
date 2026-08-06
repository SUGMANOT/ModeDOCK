export { ModeDockCore, parsePackageSpec } from "./core/core.js";
export { DependencyResolver } from "./core/resolver.js";
export { StaticRegistry, RegistrySet } from "./registry/static-registry.js";
export { packMod, buildRegistry } from "./publisher/index.js";
export { ChallengeManager, ChallengeStore, snapshotEvidence, createChallengeTemplate } from "./challenge/index.js";
export { satisfies, compareVersions, parseVersion, sortVersionsDescending } from "./semver.js";
export { validateManifest, validateDescriptor, validateRegistry, validateProfile, validateChallengeCapsule, validateChallengeSession, validateChallengeTicket, validateChallengeResult } from "./validation.js";
export { ModeDockCoreError, ValidationError, ResolutionError, PlanStaleError, ProfileLockedError } from "./errors.js";
export * from "./types.js";
