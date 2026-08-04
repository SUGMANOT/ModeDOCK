import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ModeDockError } from "../../core/errors.js";

export async function readJson<T>(file: string, fallback?: T): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && fallback !== undefined) return fallback;
    throw new ModeDockError(`Could not read state file ${file}: ${(error as Error).message}`, "CORRUPT_STATE", { file });
  }
}

export async function writeJson<T>(file: string, value: T): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(file, { force: true });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}
