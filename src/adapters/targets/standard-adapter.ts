import { readdir } from "node:fs/promises";
import path from "node:path";
import type { DetectionContext, DetectedTarget } from "../../types/index.js";
import { exists } from "../../services/filesystem/safe-fs.js";
import { ManualTargetAdapter } from "./manual-adapter.js";
import { findExecutable } from "./detection-utils.js";

export class StandardTargetAdapter extends ManualTargetAdapter {
  override id = "standard";
  override name = "Standard application directory detector";

  override async detect(context: DetectionContext): Promise<DetectedTarget[]> {
    const roots = context.roots;
    const result: DetectedTarget[] = [];
    for (const root of roots) {
      if (!await exists(root)) continue;
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const rootDir = path.join(root, entry.name);
        const executable = await findExecutable(rootDir);
        if (!executable) continue;
        result.push({
          detectionId: `standard:${Buffer.from(rootDir).toString("base64url")}`,
          adapterId: this.id,
          name: entry.name,
          rootDir,
          executable,
          confidence: "low"
        });
      }
    }
    return result;
  }
}
