import { stat } from "node:fs/promises";
import path from "node:path";
import type { FormatAdapter, SourceEntry } from "../../types/index.js";
import { exists, isDirectory, sha256File } from "../../services/filesystem/safe-fs.js";
import { ModeDockError } from "../../core/errors.js";

export class FileFormatAdapter implements FormatAdapter {
  id = "file";
  async canHandle(sourcePath: string): Promise<boolean> { return await exists(sourcePath) && !await isDirectory(sourcePath); }

  async expand(sourcePath: string, limits: { maxFiles: number; maxBytes: number }): Promise<{ type: "file"; entries: SourceEntry[] }> {
    const size = (await stat(sourcePath)).size;
    if (size > limits.maxBytes) throw new ModeDockError(`File exceeds ${limits.maxBytes} bytes.`, "SOURCE_LIMIT");
    return { type: "file", entries: [{ relative: path.basename(sourcePath), sourcePath, size, sha256: await sha256File(sourcePath) }] };
  }
}
