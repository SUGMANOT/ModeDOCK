import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ModeDockCoreError } from "../errors.js";

export async function readJsonFile<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new ModeDockCoreError(`Invalid JSON state file: ${file}`, "CORRUPT_STATE", { file }, { cause: error });
    throw error;
  }
}

export async function readJsonFileOptional<T>(file: string): Promise<T | undefined> {
  try { return await readJsonFile<T>(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (process.platform === "win32") {
      const previous = `${file}.previous`;
      await rm(previous, { force: true });
      try { await rename(file, previous); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(temporary, file);
      await rm(previous, { force: true });
    } else {
      await rename(temporary, file);
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
