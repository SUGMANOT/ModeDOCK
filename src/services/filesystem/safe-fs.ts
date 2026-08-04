import { constants, createReadStream } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ModeDockError } from "../../core/errors.js";

export function expandPath(value: string): string {
  const trimmed = value.trim();
  const unquoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  const expanded = unquoted
    .replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`)
    .replace(/^~(?=$|[\\/])/, process.env.USERPROFILE ?? process.env.HOME ?? "~");
  return path.resolve(expanded);
}

export function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ModeDockError(`Invalid identifier: ${value}`, "INVALID_ID");
  return value;
}

export function normalizeRelative(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized === ".") return ".";
  if (path.isAbsolute(normalized) || normalized.includes(":") || normalized.split("/").some(part => !part || part === "." || part === ".."))
    throw new ModeDockError(`Path must remain inside the selected target: ${value}`, "PATH_TRAVERSAL");
  return normalized;
}

export function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new ModeDockError(`Operation escaped the selected target: ${candidate}`, "PATH_TRAVERSAL");
  return resolved;
}

export async function rejectNestedLinks(root: string, candidate: string): Promise<void> {
  const resolved = ensureInside(root, candidate);
  const relative = path.relative(path.resolve(root), resolved);
  if (!relative) return;
  let current = path.resolve(root);
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new ModeDockError(`Symbolic links and junctions are not allowed in managed paths: ${current}`, "UNSAFE_LINK");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

export async function isDirectory(file: string): Promise<boolean> {
  try { return (await stat(file)).isDirectory(); } catch { return false; }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function atomicWrite(destination: string, content: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.moddock-${randomUUID()}.tmp`);
  await writeFile(temporary, content);
  try {
    await rename(temporary, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(destination, { force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function atomicCopy(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.moddock-${randomUUID()}.tmp`);
  await copyFile(source, temporary);
  try {
    await rename(temporary, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(destination, { force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function copyTree(source: string, destination: string): Promise<void> {
  const { cp } = await import("node:fs/promises");
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false });
}

export async function assertWritable(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.W_OK);
}

export async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}
