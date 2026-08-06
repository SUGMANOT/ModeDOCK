import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ModeDockCoreError } from "../errors.js";

export function isUrl(value: string): boolean {
  try { return ["http:", "https:", "file:"].includes(new URL(value).protocol); } catch { return false; }
}

export function normalizeResource(value: string): string {
  if (isUrl(value)) return new URL(value).href;
  return path.resolve(value);
}

export function resolveResource(base: string, reference: string): string {
  if (isUrl(reference)) return new URL(reference).href;
  if (path.isAbsolute(reference) || /^[A-Za-z]:[\\/]/.test(reference)) return path.resolve(reference);
  if (isUrl(base)) return new URL(reference.replaceAll("\\", "/"), base).href;
  return path.resolve(path.dirname(base), reference);
}

export async function readResource(location: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const normalized = normalizeResource(location);
  if (isUrl(normalized)) {
    const url = new URL(normalized);
    if (url.protocol === "file:") return new Uint8Array(await readFile(fileURLToPath(url)));
    const response = await fetchImpl(url);
    if (!response.ok) throw new ModeDockCoreError(`Could not fetch ${url}: HTTP ${response.status}`, "RESOURCE_FETCH_FAILED", { location: url.href, status: response.status });
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(normalized));
}

export async function readJsonResource<T>(location: string, fetchImpl: typeof fetch): Promise<T> {
  const bytes = await readResource(location, fetchImpl);
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch (error) { throw new ModeDockCoreError(`Invalid JSON resource: ${location}`, "INVALID_RESOURCE", { location }, { cause: error as Error }); }
}

export function resourceDirectory(location: string): string {
  const normalized = normalizeResource(location);
  if (isUrl(normalized)) return new URL("./", normalized).href;
  return path.dirname(normalized) + path.sep;
}

export function toFileUrl(file: string): string { return pathToFileURL(path.resolve(file)).href; }
