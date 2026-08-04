import path from "node:path";
import type { ModeDockConfig } from "../../types/index.js";
import { defaultDataDir, DataPaths } from "../filesystem/paths.js";
import { expandPath } from "../filesystem/safe-fs.js";
import { readJson, writeJson } from "./json-file.js";

export const DEFAULT_CONFIG: ModeDockConfig = {
  createBackups: true,
  confirmBeforeRemove: true,
  language: "en",
  theme: "default",
  logoStyle: "full",
  logLevel: "info",
  detectionRoots: [],
  customAdapters: [],
  maxArchiveFiles: 10_000,
  maxArchiveBytes: 1_073_741_824
};

export class ConfigService {
  private value: ModeDockConfig = structuredClone(DEFAULT_CONFIG);
  constructor(public readonly file: string) {}

  async load(): Promise<ModeDockConfig> {
    const loaded = await readJson<Partial<ModeDockConfig>>(this.file, {});
    const knownKeys = new Set([...Object.keys(DEFAULT_CONFIG), "defaultTarget", "dataDir"]);
    const supported = Object.fromEntries(Object.entries(loaded).filter(([key]) => knownKeys.has(key))) as Partial<ModeDockConfig>;
    this.value = { ...structuredClone(DEFAULT_CONFIG), ...supported };
    if (!["en", "ru"].includes(this.value.language)) this.value.language = DEFAULT_CONFIG.language;
    if (!["default", "mono", "amber"].includes(this.value.theme)) this.value.theme = DEFAULT_CONFIG.theme;
    if (!["full", "compact"].includes(this.value.logoStyle)) this.value.logoStyle = DEFAULT_CONFIG.logoStyle;
    return this.getAll();
  }

  getAll(): ModeDockConfig { return structuredClone(this.value); }
  get<K extends keyof ModeDockConfig>(key: K): ModeDockConfig[K] { return this.value[key]; }

  async set<K extends keyof ModeDockConfig>(key: K, value: ModeDockConfig[K]): Promise<void> {
    this.value[key] = value;
    await writeJson(this.file, this.value);
  }

  async replace(value: ModeDockConfig): Promise<void> {
    this.value = structuredClone(value);
    await writeJson(this.file, this.value);
  }

  async reset(): Promise<void> { await this.replace(structuredClone(DEFAULT_CONFIG)); }
}

export interface BootstrapOptions { configPath?: string; dataDir?: string; }

export async function bootstrapConfig(options: BootstrapOptions): Promise<{ config: ConfigService; paths: DataPaths }> {
  const initialRoot = expandPath(options.dataDir ?? process.env.MODDOCK_DATA_DIR ?? defaultDataDir());
  const configPath = expandPath(options.configPath ?? path.join(initialRoot, "config.json"));
  const config = new ConfigService(configPath);
  const loaded = await config.load();
  const stateRoot = expandPath(options.dataDir ?? process.env.MODDOCK_DATA_DIR ?? loaded.dataDir ?? initialRoot);
  return { config, paths: new DataPaths(stateRoot) };
}
