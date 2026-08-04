import type { FormatAdapter, ModeDockConfig } from "../../types/index.js";
import { expandPath } from "../../services/filesystem/safe-fs.js";
import { ModeDockError } from "../../core/errors.js";
import { ZipFormatAdapter } from "./zip-adapter.js";
import { FolderFormatAdapter } from "./folder-adapter.js";
import { FileFormatAdapter } from "./file-adapter.js";

export class FormatRegistry {
  private readonly adapters: FormatAdapter[] = [new ZipFormatAdapter(), new FolderFormatAdapter(), new FileFormatAdapter()];

  register(adapter: FormatAdapter): void { this.adapters.unshift(adapter); }

  async expand(source: string, config: ModeDockConfig) {
    const sourcePath = expandPath(source);
    for (const adapter of this.adapters) {
      if (await adapter.canHandle(sourcePath)) return { sourcePath, adapterId: adapter.id, ...(await adapter.expand(sourcePath, {
        maxFiles: config.maxArchiveFiles,
        maxBytes: config.maxArchiveBytes
      })) };
    }
    throw new ModeDockError(`Source does not exist or no format adapter supports it: ${source}`, "UNSUPPORTED_SOURCE");
  }
}
