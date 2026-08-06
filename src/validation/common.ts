import path from "node:path";
import { ValidationError } from "../errors.js";

export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const URL_PROTOCOLS = new Set(["http:", "https:", "file:"]);

export function validateId(value: unknown, label = "identifier"): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new ValidationError(`Invalid ${label}: ${String(value)}`);
  return value;
}

export function validateOriginalBackup(value: unknown, label: string): void {
  const input = asRecord(value, label);
  const backupPath = expectString(input.path, `${label}.path`);
  if (!path.isAbsolute(backupPath)) throw new ValidationError(`${label}.path must be absolute.`);
  validateSha256(input.sha256, `${label}.sha256`);
  expectInteger(input.size, `${label}.size`, 0);
}

export function validateSha256(value: unknown, label: string): string {
  const result = expectString(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(result)) throw new ValidationError(`${label} must be a SHA-256 hash.`);
  return result;
}

export function validateResourceLocation(value: string, label: string): void {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return;
  try {
    const parsed = new URL(value);
    if (!URL_PROTOCOLS.has(parsed.protocol)) throw new ValidationError(`${label} uses an unsupported protocol: ${parsed.protocol}`);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (!value.trim()) throw new ValidationError(`${label} cannot be empty.`);
  }
}

export function validateDependencyMap(value: unknown, label: string): Record<string, string> {
  const input = asRecord(value, label);
  const result: Record<string, string> = {};
  for (const [packageId, range] of Object.entries(input)) result[validateId(packageId, `${label} package ID`)] = expectString(range, `${label}.${packageId}`);
  return result;
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array.`);
  return value;
}

export function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new ValidationError(`${label} must be a string.`);
  return value;
}

export function expectNonEmpty(value: unknown, label: string): string {
  const result = expectString(value, label).trim();
  if (!result) throw new ValidationError(`${label} cannot be empty.`);
  return result;
}

export function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${label} must be a boolean.`);
  return value;
}

export function expectInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new ValidationError(`${label} must be an integer >= ${minimum}.`);
  return Number(value);
}

export function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ValidationError(`${label} must be a finite number.`);
  return value;
}

export function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((item, index) => expectString(item, `${label}[${index}]`));
}

export function expectIsoDate(value: unknown, label: string): string {
  const result = expectString(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new ValidationError(`${label} must be an ISO date.`);
  return result;
}
