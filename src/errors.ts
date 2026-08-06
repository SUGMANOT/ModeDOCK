export class ModeDockCoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ModeDockCoreError";
  }
}

export class ValidationError extends ModeDockCoreError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class ResolutionError extends ModeDockCoreError {
  constructor(message: string, details?: unknown) {
    super(message, "RESOLUTION_ERROR", details);
    this.name = "ResolutionError";
  }
}

export class PlanStaleError extends ModeDockCoreError {
  constructor(path: string, expected: unknown, actual: unknown) {
    super(`The filesystem changed after planning: ${path}`, "PLAN_STALE", { path, expected, actual });
    this.name = "PlanStaleError";
  }
}

export class ProfileLockedError extends ModeDockCoreError {
  constructor(profileId: string, lockPath: string) {
    super(`Profile '${profileId}' is already being modified.`, "PROFILE_LOCKED", { profileId, lockPath });
    this.name = "ProfileLockedError";
  }
}
