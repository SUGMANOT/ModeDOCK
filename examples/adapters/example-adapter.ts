import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DetectedTarget, DetectionContext, TargetAdapter, TargetProfile } from "../../src/types/index.js";

const adapter: TargetAdapter = {
  id: "example-game",
  name: "Example Game adapter",

  async detect(_context: DetectionContext): Promise<DetectedTarget[]> {
    // Keep detection read-only. Return candidates found through documented paths.
    return [];
  },

  createProfile(input): TargetProfile {
    const now = new Date().toISOString();
    return {
      id: input.id ?? randomUUID().replaceAll("-", ""),
      name: input.name.trim(),
      rootDir: path.resolve(input.rootDir),
      executable: input.executable,
      modsDir: input.modsDir ?? "Mods",
      pluginsDir: input.pluginsDir ?? "BepInEx/plugins",
      configDir: input.configDir ?? "BepInEx/config",
      loader: input.loader ?? "BepInEx",
      adapterId: "example-game",
      supportedExtensions: input.supportedExtensions ?? [".dll", ".zip", ".json", ".cfg"],
      rules: input.rules ?? [],
      createdAt: input.createdAt ?? now,
      updatedAt: now
    };
  },

  async validate(profile): Promise<string[]> {
    const issues: string[] = [];
    if (!profile.executable.toLowerCase().endsWith(".exe")) issues.push("Expected a Windows executable.");
    return issues;
  },

  routeFile(_profile, sourceRelative) {
    return path.extname(sourceRelative).toLowerCase() === ".dll" ? "plugins" : "mods";
  }
};

export default adapter;
