import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { FormatAdapter, SourceEntry } from "../../types/index.js";
import { isDirectory, normalizeRelative, sha256File } from "../../services/filesystem/safe-fs.js";
import { ModeDockError } from "../../core/errors.js";

export class FolderFormatAdapter implements FormatAdapter {
  id = "folder";
  async canHandle(sourcePath: string): Promise<boolean> { return isDirectory(sourcePath); }

  async expand(sourcePath: string, limits: { maxFiles: number; maxBytes: number }): Promise<{ type: "folder"; entries: SourceEntry[] }> {
    const entries: SourceEntry[] = [];
    let total = 0;
    let fileCount = 0;
    const walk = async (directory: string): Promise<void> => {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isSymbolicLink()) throw new ModeDockError(`Source folders cannot contain symbolic links: ${file}`, "UNSAFE_LINK");
        if (item.isDirectory()) { await walk(file); continue; }
        if (!item.isFile()) continue;
        if (++fileCount > limits.maxFiles) throw new ModeDockError(`Folder exceeds ${limits.maxFiles} files.`, "SOURCE_LIMIT");
        const size = (await stat(file)).size;
        total += size;
        if (total > limits.maxBytes) throw new ModeDockError(`Folder exceeds ${limits.maxBytes} bytes.`, "SOURCE_LIMIT");
        entries.push({ relative: normalizeRelative(path.relative(sourcePath, file)), sourcePath: file, size, sha256: await sha256File(file) });
      }
    };
    await walk(sourcePath);
    if (!entries.length) throw new ModeDockError("The source folder contains no files.", "EMPTY_SOURCE");
    return { type: "folder", entries };
  }
}
