import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DetectionContext, DetectedTarget } from "../../types/index.js";
import { exists } from "../../services/filesystem/safe-fs.js";
import { ManualTargetAdapter } from "./manual-adapter.js";
import { findExecutable, parseValveValue } from "./detection-utils.js";

export class SteamTargetAdapter extends ManualTargetAdapter {
  override id = "steam";
  override name = "Steam library detector";

  override async detect(context: DetectionContext): Promise<DetectedTarget[]> {
    const roots = [...defaultSteamRoots(), ...context.roots];
    const libraries = new Set<string>();
    for (const root of roots) {
      if (!await exists(root)) continue;
      libraries.add(root);
      const file = path.join(root, "steamapps", "libraryfolders.vdf");
      if (await exists(file)) {
        const text = await readFile(file, "utf8");
        for (const match of text.matchAll(/"path"\s+"([^"]+)"/gi)) libraries.add(match[1]!.replaceAll("\\\\", "\\"));
      }
    }
    const detected: DetectedTarget[] = [];
    for (const library of libraries) {
      const steamapps = path.join(library, "steamapps");
      if (!await exists(steamapps)) continue;
      for (const file of await readdir(steamapps)) {
        if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
        try {
          const text = await readFile(path.join(steamapps, file), "utf8");
          const installDir = parseValveValue(text, "installdir");
          if (!installDir) continue;
          const rootDir = path.join(steamapps, "common", installDir);
          const executable = await findExecutable(rootDir);
          if (!executable) continue;
          detected.push({
            detectionId: `steam:${parseValveValue(text, "appid") ?? installDir}`,
            adapterId: this.id,
            name: parseValveValue(text, "name") ?? installDir,
            rootDir,
            executable,
            confidence: "high"
          });
        } catch { /* ignore one malformed Steam manifest */ }
      }
    }
    return uniqueDetections(detected);
  }
}

function defaultSteamRoots(): string[] {
  if (process.platform === "win32") return [
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Steam"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Steam")
  ];
  if (process.platform === "darwin") return [path.join(process.env.HOME ?? "", "Library/Application Support/Steam")];
  return [path.join(process.env.HOME ?? "", ".steam/steam"), path.join(process.env.HOME ?? "", ".local/share/Steam")];
}

function uniqueDetections(items: DetectedTarget[]): DetectedTarget[] {
  return [...new Map(items.map(item => [path.resolve(item.rootDir).toLowerCase(), item])).values()];
}
