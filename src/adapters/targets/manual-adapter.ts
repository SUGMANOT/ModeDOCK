import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DestinationKind, DetectionContext, DetectedTarget, TargetAdapter, TargetProfile } from "../../types/index.js";
import { ensureInside, exists, expandPath, normalizeRelative, rejectNestedLinks } from "../../services/filesystem/safe-fs.js";

export const DEFAULT_EXTENSIONS = [
  ".dll", ".zip", ".asi", ".pak", ".ucas", ".utoc", ".mod", ".plugin", ".lua", ".js", ".mjs", ".cjs", ".json", ".cfg", ".ini", ".toml", ".yaml", ".yml", ".xml"
];

export class ManualTargetAdapter implements TargetAdapter {
  id = "manual";
  name = "Generic manually configured target";

  async detect(_context: DetectionContext): Promise<DetectedTarget[]> { return []; }

  createProfile(input: Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">): TargetProfile {
    const now = new Date().toISOString();
    return {
      id: input.id ?? randomUUID().replaceAll("-", ""),
      name: input.name.trim(),
      rootDir: expandPath(input.rootDir),
      executable: input.executable.trim(),
      modsDir: normalizeRelative(input.modsDir ?? "Mods"),
      pluginsDir: normalizeRelative(input.pluginsDir ?? "Plugins"),
      configDir: normalizeRelative(input.configDir ?? "Config"),
      loader: input.loader?.trim() || "none",
      adapterId: input.adapterId ?? this.id,
      supportedExtensions: normalizeExtensions(input.supportedExtensions ?? DEFAULT_EXTENSIONS),
      rules: input.rules ?? [],
      createdAt: input.createdAt ?? now,
      updatedAt: now
    };
  }

  async validate(profile: TargetProfile): Promise<string[]> {
    const issues: string[] = [];
    if (!profile.name.trim()) issues.push("Target name is empty.");
    if (!await exists(profile.rootDir)) issues.push(`Target directory does not exist: ${profile.rootDir}`);
    const executable = path.isAbsolute(profile.executable) ? profile.executable : path.join(profile.rootDir, profile.executable);
    try { ensureInside(profile.rootDir, executable); } catch (error) { issues.push((error as Error).message); }
    if (!await exists(executable)) issues.push(`Executable does not exist: ${executable}`);
    for (const directory of [profile.modsDir, profile.pluginsDir, profile.configDir]) {
      try {
        const relative = normalizeRelative(directory);
        await rejectNestedLinks(profile.rootDir, path.join(profile.rootDir, relative));
      } catch (error) { issues.push((error as Error).message); }
    }
    if (!profile.supportedExtensions.length) issues.push("No supported file extensions are configured.");
    return [...new Set(issues)];
  }

  routeFile(profile: TargetProfile, sourceRelative: string): DestinationKind | string {
    const extension = path.extname(sourceRelative).toLowerCase();
    const rule = profile.rules.find(item => item.extensions.map(value => normalizeExtension(value)).includes(extension));
    if (rule) return rule.destination;
    if ([".dll", ".asi", ".plugin"].includes(extension)) return "plugins";
    if ([".json", ".cfg", ".ini", ".toml", ".yaml", ".yml", ".xml"].includes(extension)) return "config";
    return "mods";
  }
}

export function normalizeExtension(value: string): string {
  const extension = value.trim().toLowerCase();
  return extension.startsWith(".") ? extension : `.${extension}`;
}

export function normalizeExtensions(values: string[]): string[] {
  return [...new Set(values.map(normalizeExtension).filter(value => value.length > 1))];
}
