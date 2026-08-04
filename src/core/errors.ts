export class ModeDockError extends Error {
  constructor(message: string, public readonly code = "OPERATION_ERROR", public readonly details?: unknown) {
    super(message);
    this.name = "ModeDockError";
  }
}

export class UsageError extends ModeDockError {
  constructor(message: string) {
    super(message, "USAGE_ERROR");
    this.name = "UsageError";
  }
}

export class ConfirmationRequiredError extends ModeDockError {
  constructor(message: string, details?: unknown) {
    super(message, "CONFIRMATION_REQUIRED", details);
    this.name = "ConfirmationRequiredError";
  }
}
