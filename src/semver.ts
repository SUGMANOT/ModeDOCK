import { ValidationError } from "./errors.js";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
}

const VERSION_PATTERN = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(value: string): SemVer {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) throw new ValidationError(`Invalid semantic version: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
    raw: value.trim().replace(/^v/, "")
  };
}

export function compareVersions(leftValue: string | SemVer, rightValue: string | SemVer): number {
  const left = typeof leftValue === "string" ? parseVersion(leftValue) : leftValue;
  const right = typeof rightValue === "string" ? parseVersion(rightValue) : rightValue;
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (!left.prerelease.length && right.prerelease.length) return 1;
  if (left.prerelease.length && !right.prerelease.length) return -1;
  const count = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < count; index++) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export function satisfies(versionValue: string, rangeValue: string): boolean {
  const range = rangeValue.trim();
  if (!range || range === "*" || /^latest$/i.test(range)) return true;
  return range.split("||").some(alternative => satisfiesAnd(versionValue, alternative.trim()));
}

function satisfiesAnd(versionValue: string, range: string): boolean {
  if (!range || range === "*") return true;
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(range);
  if (hyphen) return compareVersions(versionValue, normalizePartial(hyphen[1]!, "lower")) >= 0
    && compareVersions(versionValue, normalizePartial(hyphen[2]!, "upper")) <= 0;

  const tokens = range.split(/\s+/).filter(Boolean);
  return tokens.every(token => satisfiesToken(versionValue, token));
}

function satisfiesToken(versionValue: string, token: string): boolean {
  if (token === "*" || /^x$/i.test(token)) return true;
  if (token.startsWith("^")) {
    const base = parsePartial(token.slice(1));
    const lower = `${base.major}.${base.minor}.${base.patch}`;
    const upper = base.major > 0
      ? `${base.major + 1}.0.0`
      : base.minor > 0 ? `0.${base.minor + 1}.0` : `0.0.${base.patch + 1}`;
    return compareVersions(versionValue, lower) >= 0 && compareVersions(versionValue, upper) < 0;
  }
  if (token.startsWith("~")) {
    const base = parsePartial(token.slice(1));
    const lower = `${base.major}.${base.minor}.${base.patch}`;
    const upper = `${base.major}.${base.minor + 1}.0`;
    return compareVersions(versionValue, lower) >= 0 && compareVersions(versionValue, upper) < 0;
  }

  const comparator = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
  if (!comparator) return false;
  const operator = comparator[1] ?? "=";
  const raw = comparator[2]!.trim();
  if (/[xX*]/.test(raw) || /^\d+(?:\.\d+)?$/.test(raw)) return satisfiesWildcard(versionValue, raw);
  const comparison = compareVersions(versionValue, parseVersion(raw));
  return operator === ">=" ? comparison >= 0
    : operator === "<=" ? comparison <= 0
      : operator === ">" ? comparison > 0
        : operator === "<" ? comparison < 0
          : comparison === 0;
}

function satisfiesWildcard(versionValue: string, raw: string): boolean {
  const version = parseVersion(versionValue);
  const parts = raw.split(".");
  const expected = [version.major, version.minor, version.patch];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (/^[xX*]$/.test(part)) return true;
    if (Number(part) !== expected[index]) return false;
  }
  return true;
}

function parsePartial(value: string): { major: number; minor: number; patch: number } {
  const parts = value.trim().replace(/^v/, "").split(".");
  if (!parts.length || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) {
    throw new ValidationError(`Invalid semantic version range component: ${value}`);
  }
  return { major: Number(parts[0]), minor: Number(parts[1] ?? 0), patch: Number(parts[2] ?? 0) };
}

function normalizePartial(value: string, mode: "lower" | "upper"): string {
  const parts = value.trim().split(".");
  const normalized = parsePartial(value);
  if (mode === "upper" && parts.length < 3) {
    if (parts.length === 1) return `${normalized.major}.999999.999999`;
    return `${normalized.major}.${normalized.minor}.999999`;
  }
  return `${normalized.major}.${normalized.minor}.${normalized.patch}`;
}

export function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((left, right) => compareVersions(right, left));
}
