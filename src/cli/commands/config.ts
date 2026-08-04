import type { ModeDockConfig } from "../../types/index.js";
import { UsageError } from "../../core/errors.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { confirmOrThrow, requiredPosition } from "./shared.js";

export async function configCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1] ?? "list";
  const output = new CliOutput(environment.json, environment.quiet);
  if (action === "list") { environment.args.ensureOnly(); output.value(environment.context.config.getAll()); return; }
  if (action === "get") {
    environment.args.ensureOnly();
    const key = configKey(requiredPosition(positionals, 2, "configuration key"));
    output.value(environment.context.config.get(key));
    return;
  }
  if (action === "set") {
    environment.args.ensureOnly();
    const key = configKey(requiredPosition(positionals, 2, "configuration key"));
    const raw = requiredPosition(positionals, 3, "configuration value");
    const value = parseConfigValue(key, raw, environment.context.config.getAll());
    await environment.context.config.set(key, value as never);
    output.value({ key, value }, `Set ${key}.`);
    return;
  }
  if (action === "reset") {
    environment.args.ensureOnly();
    await confirmOrThrow(environment, "Reset all ModeDOCK configuration values?");
    await environment.context.config.reset();
    output.value(environment.context.config.getAll(), "Configuration reset.");
    return;
  }
  throw new UsageError(`Unknown config action: ${action}`);
}

function configKey(value: string): keyof ModeDockConfig {
  const keys: Array<keyof ModeDockConfig> = ["defaultTarget", "dataDir", "createBackups", "confirmBeforeRemove", "language", "theme", "logoStyle", "logLevel", "detectionRoots", "customAdapters", "maxArchiveFiles", "maxArchiveBytes"];
  const key = keys.find(item => item.toLowerCase() === value.toLowerCase());
  if (!key) throw new UsageError(`Unknown configuration key: ${value}`);
  return key;
}

function parseConfigValue(key: keyof ModeDockConfig, raw: string, current: ModeDockConfig): unknown {
  const existing = current[key];
  if (typeof existing === "boolean") {
    if (!["true", "false"].includes(raw.toLowerCase())) throw new UsageError(`${key} must be true or false.`);
    return raw.toLowerCase() === "true";
  }
  if (typeof existing === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1) throw new UsageError(`${key} must be a positive number.`);
    return value;
  }
  if (Array.isArray(existing)) return raw.trim().startsWith("[") ? JSON.parse(raw) : raw.split(",").map(item => item.trim()).filter(Boolean);
  const normalized = raw.toLowerCase();
  if (key === "language") {
    if (!["en", "ru"].includes(normalized)) throw new UsageError("language must be en or ru.");
    return normalized;
  }
  if (key === "theme") {
    if (!["default", "mono", "amber"].includes(normalized)) throw new UsageError("theme must be default, mono, or amber.");
    return normalized;
  }
  if (key === "logoStyle") {
    if (!["full", "compact"].includes(normalized)) throw new UsageError("logoStyle must be full or compact.");
    return normalized;
  }
  if (key === "logLevel") {
    if (!["error", "warn", "info", "debug"].includes(normalized)) throw new UsageError("logLevel must be error, warn, info, or debug.");
    return normalized;
  }
  return raw === "null" || raw === "undefined" ? undefined : raw;
}
