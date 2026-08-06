import path from "node:path";
import { lstat } from "node:fs/promises";
import { ModeDockCoreError, ValidationError } from "../errors.js";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizeRelative(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized === ".") return ".";
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new ValidationError(`Path must be relative: ${value}`);
  }
  const parts = normalized.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") throw new ValidationError(`Unsafe relative path: ${value}`);
    if (part.includes(":")) throw new ValidationError(`Colon is not allowed in package paths: ${value}`);
    if (part.endsWith(".") || part.endsWith(" ")) throw new ValidationError(`Trailing dots and spaces are not allowed: ${value}`);
    if (WINDOWS_RESERVED.test(part)) throw new ValidationError(`Reserved Windows filename is not allowed: ${value}`);
  }
  return parts.join("/");
}

export function resolveInside(root: string, relative: string): string {
  const safeRelative = normalizeRelative(relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, safeRelative === "." ? "" : safeRelative);
  const difference = path.relative(resolvedRoot, resolved);
  if (difference.startsWith("..") || path.isAbsolute(difference)) {
    throw new ModeDockCoreError(`Path escaped the game root: ${relative}`, "PATH_TRAVERSAL", { root, relative });
  }
  return resolved;
}

export async function rejectNestedLinks(root: string, destination: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedDestination = path.resolve(destination);
  const relative = path.relative(resolvedRoot, resolvedDestination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ModeDockCoreError(`Destination escaped the game root: ${destination}`, "PATH_TRAVERSAL");
  }
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new ModeDockCoreError(`Managed paths cannot traverse symbolic links or junctions: ${current}`, "UNSAFE_LINK");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export function pathKey(relative: string): string {
  return normalizeRelative(relative).toLocaleLowerCase("en-US");
}
