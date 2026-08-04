import path from "node:path";
import { stat } from "node:fs/promises";
import { unzipSync } from "fflate";
import type { FormatAdapter, SourceEntry } from "../../types/index.js";
import { isDirectory, normalizeRelative, readBytes, sha256Bytes } from "../../services/filesystem/safe-fs.js";
import { ModeDockError } from "../../core/errors.js";

export class ZipFormatAdapter implements FormatAdapter {
  id = "zip";
  async canHandle(sourcePath: string): Promise<boolean> { return !await isDirectory(sourcePath) && path.extname(sourcePath).toLowerCase() === ".zip"; }

  async expand(sourcePath: string, limits: { maxFiles: number; maxBytes: number }): Promise<{ type: "archive"; entries: SourceEntry[] }> {
    const compressedSize = (await stat(sourcePath)).size;
    if (compressedSize > limits.maxBytes) throw new ModeDockError(`Archive exceeds ${limits.maxBytes} compressed bytes.`, "ARCHIVE_LIMIT");
    const bytes = await readBytes(sourcePath);
    let files = 0;
    let total = 0;
    let unpacked: Record<string, Uint8Array>;
    try {
      unpacked = unzipSync(bytes, {
        filter(file) {
          if (file.name.endsWith("/")) return false;
          normalizeRelative(file.name);
          files++;
          total += file.originalSize;
          if (files > limits.maxFiles) throw new ModeDockError(`Archive exceeds ${limits.maxFiles} files.`, "ARCHIVE_LIMIT");
          if (total > limits.maxBytes) throw new ModeDockError(`Archive exceeds ${limits.maxBytes} uncompressed bytes.`, "ARCHIVE_LIMIT");
          return true;
        }
      });
    } catch (error) {
      if (error instanceof ModeDockError) throw error;
      throw new ModeDockError(`Invalid or corrupted ZIP archive: ${(error as Error).message}`, "INVALID_ARCHIVE");
    }
    const entries = Object.entries(unpacked).map(([relative, content]) => ({
      relative: normalizeRelative(relative),
      size: content.byteLength,
      sha256: sha256Bytes(content),
      content
    }));
    if (!entries.length) throw new ModeDockError("The ZIP archive contains no files.", "EMPTY_SOURCE");
    return { type: "archive", entries };
  }
}
