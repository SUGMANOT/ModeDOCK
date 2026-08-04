import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { InstallationRule, TargetProfile } from "../../types/index.js";
import { ModeDockError } from "../../core/errors.js";
import { exists, expandPath, normalizeRelative } from "../../services/filesystem/safe-fs.js";
import { DEFAULT_EXTENSIONS } from "./manual-adapter.js";

export type AnalyzedTargetInput = Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">;

interface ScannedFile { relative: string; size: number; }
interface InstallationScan { files: ScannedFile[]; directories: string[]; }

const executableNoise = /(?:unins|uninstall|crash|report|handler|updater?|setup|install|redist|vcredist|unitycrash|easyanticheat|beservice|eac)/i;

export async function analyzeInstallation(rootInput: string, preferredExecutable?: string, preferredName?: string): Promise<AnalyzedTargetInput> {
  const rootDir = expandPath(rootInput);
  if (!await exists(rootDir) || !(await stat(rootDir)).isDirectory())
    throw new ModeDockError(`Installation directory does not exist: ${rootDir}`, "INVALID_TARGET");

  const scan = await scanInstallation(rootDir);
  const executable = selectExecutable(rootDir, scan.files, preferredExecutable);
  if (!executable) throw new ModeDockError(
    "No likely game executable was found in this folder. Select the game's installation root, not a launcher or library folder.",
    "EXECUTABLE_NOT_FOUND"
  );

  const integration = detectIntegration(scan);
  return {
    name: preferredName?.trim() || inferName(rootDir, executable),
    rootDir,
    executable,
    loader: integration.loader,
    modsDir: integration.modsDir,
    pluginsDir: integration.pluginsDir,
    configDir: integration.configDir,
    rules: integration.rules,
    supportedExtensions: DEFAULT_EXTENSIONS
  };
}

export async function findExecutable(root: string, preferred?: string): Promise<string | undefined> {
  if (preferred) {
    const candidate = path.isAbsolute(preferred) ? preferred : path.join(root, preferred);
    if (await exists(candidate)) return normalizeRelative(path.relative(root, candidate) || path.basename(candidate));
  }

  const directories = [root, path.join(root, "bin"), path.join(root, "Binaries"), path.join(root, "Binaries", "Win64")];
  if (await exists(root)) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      directories.push(path.join(root, entry.name, "Binaries", "Win64"), path.join(root, entry.name, "Binaries", "Win32"));
    }
  }
  const files: ScannedFile[] = [];
  for (const directory of directories) {
    if (!await exists(directory)) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !isExecutable(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      files.push({ relative: normalizeRelative(path.relative(root, absolute)), size: (await stat(absolute)).size });
    }
  }
  return selectExecutable(root, files);
}

export function parseValveValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`"${escapeRegex(key)}"\\s+"([^"]+)"`, "i"));
  return match?.[1]?.replaceAll("\\\\", "\\");
}

async function scanInstallation(root: string, maxDepth = 5, maxEntries = 5_000): Promise<InstallationScan> {
  const files: ScannedFile[] = [];
  const directories: string[] = [];
  const queue: Array<{ absolute: string; depth: number }> = [{ absolute: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxEntries) {
    const current = queue.shift()!;
    let entries;
    try { entries = await readdir(current.absolute, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (++visited > maxEntries) break;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current.absolute, entry.name);
      const relative = normalizeRelative(path.relative(root, absolute));
      if (entry.isDirectory()) {
        directories.push(relative);
        if (current.depth < maxDepth && !shouldSkipDirectory(entry.name)) queue.push({ absolute, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      try { size = (await stat(absolute)).size; } catch { /* inaccessible file */ }
      files.push({ relative, size });
    }
  }
  return { files, directories };
}

function selectExecutable(root: string, files: ScannedFile[], preferred?: string): string | undefined {
  if (preferred) {
    const normalized = normalizeRelative(path.isAbsolute(preferred) ? path.relative(root, preferred) : preferred);
    const exact = files.find(file => file.relative.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact.relative;
  }
  const rootName = normalizeName(path.basename(root));
  return files
    .filter(file => isExecutable(file.relative))
    .map(file => ({ file, score: executableScore(file, rootName) }))
    .filter(item => item.score > -500)
    .sort((a, b) => b.score - a.score || a.file.relative.localeCompare(b.file.relative))[0]?.file.relative;
}

function executableScore(file: ScannedFile, rootName: string): number {
  const name = path.basename(file.relative, path.extname(file.relative));
  const normalized = normalizeName(name.replace(/(?:-win(?:32|64)-shipping|\.x64|_x64)$/i, ""));
  let score = Math.min(25, file.size / 1_048_576);
  if (!file.relative.includes("/") && !file.relative.includes("\\")) score += 35;
  if (normalized === rootName) score += 120;
  else if (rootName.length > 3 && (normalized.includes(rootName) || rootName.includes(normalized))) score += 55;
  if (/shipping/i.test(name)) score += 45;
  if (/binaries[\\/]win64/i.test(file.relative)) score += 25;
  if (/launcher/i.test(name)) score -= 20;
  if (executableNoise.test(name)) score -= 1_000;
  return score;
}

function detectIntegration(scan: InstallationScan): { loader: string; modsDir: string; pluginsDir: string; configDir: string; rules: InstallationRule[] } {
  const directory = (name: string) => scan.directories.find(item => item.toLowerCase() === name.toLowerCase());
  const fileEnding = (name: string) => scan.files.find(item => item.relative.toLowerCase().endsWith(name.toLowerCase()))?.relative;

  const bepinex = directory("BepInEx");
  if (bepinex) return {
    loader: "BepInEx",
    modsDir: `${bepinex}/plugins`, pluginsDir: `${bepinex}/plugins`, configDir: `${bepinex}/config`,
    rules: [{ extensions: [".dll", ".plugin"], destination: `${bepinex}/plugins` }]
  };

  const melon = directory("MelonLoader");
  if (melon) return {
    loader: "MelonLoader",
    modsDir: directory("Mods") ?? "Mods", pluginsDir: directory("Plugins") ?? "Plugins", configDir: directory("UserData") ?? "UserData",
    rules: [{ extensions: [".dll", ".plugin"], destination: directory("Mods") ?? "Mods" }]
  };

  const ue4ssFile = fileEnding("UE4SS.dll") ?? fileEnding("UE4SS-settings.ini");
  if (ue4ssFile) {
    const base = normalizeRelative(path.dirname(ue4ssFile));
    const mods = normalizeRelative(path.join(base, "Mods"));
    return { loader: "UE4SS", modsDir: mods, pluginsDir: mods, configDir: base, rules: [{ extensions: [".lua", ".dll"], destination: mods }] };
  }

  const reframework = scan.directories.find(item => path.basename(item).toLowerCase() === "reframework");
  if (reframework) return {
    loader: "REFramework",
    modsDir: `${reframework}/plugins`, pluginsDir: `${reframework}/plugins`, configDir: reframework,
    rules: [{ extensions: [".dll", ".lua"], destination: `${reframework}/plugins` }]
  };

  const paks = scan.directories.find(item => /content[\\/]paks$/i.test(item));
  if (paks) {
    const mods = normalizeRelative(path.join(paks, "~mods"));
    return {
      loader: "Unreal Engine (no DLL loader detected)",
      modsDir: mods, pluginsDir: mods, configDir: "Config",
      rules: [{ extensions: [".pak", ".ucas", ".utoc"], destination: mods }]
    };
  }

  return { loader: "none", modsDir: "Mods", pluginsDir: "Plugins", configDir: "Config", rules: [] };
}

function inferName(root: string, executable: string): string {
  const folder = path.basename(root).trim();
  if (folder && !/^(?:bin|binaries|win64|game|app)$/i.test(folder)) return humanize(folder);
  const executableName = path.basename(executable, path.extname(executable)).replace(/(?:-win(?:32|64)-shipping|\.x64|_x64)$/i, "");
  return humanize(executableName);
}

function humanize(value: string): string {
  return value.replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

function normalizeName(value: string): string { return value.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, ""); }
function isExecutable(value: string): boolean { return process.platform === "win32" ? value.toLowerCase().endsWith(".exe") : !path.basename(value).includes("."); }
function shouldSkipDirectory(value: string): boolean { return /^(?:_commonredist|redist|redistributable|support|installer|dotnet|node_modules|logs?|screenshots?)$/i.test(value); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
