import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DetectionContext, DetectedTarget } from "../../types/index.js";
import { exists } from "../../services/filesystem/safe-fs.js";
import { ManualTargetAdapter } from "./manual-adapter.js";
import { findExecutable } from "./detection-utils.js";

export class EpicTargetAdapter extends ManualTargetAdapter {
  override id = "epic";
  override name = "Epic Games manifest detector";

  override async detect(_context: DetectionContext): Promise<DetectedTarget[]> {
    if (process.platform !== "win32") return [];
    const directory = path.join(process.env.ProgramData ?? "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
    if (!await exists(directory)) return [];
    const result: DetectedTarget[] = [];
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".item")) continue;
      try {
        const item = JSON.parse(await readFile(path.join(directory, file), "utf8")) as Record<string, unknown>;
        const rootDir = String(item.InstallLocation ?? "");
        if (!rootDir || !await exists(rootDir)) continue;
        const executable = await findExecutable(rootDir, String(item.LaunchExecutable ?? ""));
        if (!executable) continue;
        result.push({
          detectionId: `epic:${String(item.CatalogItemId ?? file)}`,
          adapterId: this.id,
          name: String(item.DisplayName ?? item.AppName ?? path.basename(rootDir)),
          rootDir,
          executable,
          confidence: "high"
        });
      } catch { /* ignore malformed Epic manifest */ }
    }
    return result;
  }
}
