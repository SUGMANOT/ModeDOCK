import { UsageError } from "../../core/errors.js";
import { inspectDll } from "../../runtime/inspection/pe-inspector.js";
import { ManagedInspectorClient } from "../../runtime/inspection/managed-inspector-client.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { requiredPosition } from "./shared.js";
import { installCommand, mutateModCommand } from "./mods.js";
import { activeTarget } from "./shared.js";
import { exists } from "../../services/filesystem/safe-fs.js";
import path from "node:path";

export async function pluginCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1];
  if (!action || !["inspect", "compatibility", "install", "enable", "disable"].includes(action))
    throw new UsageError(`Unknown plugin action: ${action ?? "<missing>"}. Run 'moddock help plugin'.`);
  if (action === "install") return installCommand(environment, ["install", requiredPosition(positionals, 2, "plugin path")]);
  if (action === "enable" || action === "disable") return mutateModCommand(environment, [action, requiredPosition(positionals, 2, "plugin name/ID")], action);
  environment.args.ensureOnly();
  let file = requiredPosition(positionals, 2, "managed plugin path or installed ID");
  if (!await exists(file) && action === "compatibility") {
    const target = await activeTarget(environment);
    const record = await environment.context.installationStore.resolve(target.id, file);
    const dll = record.files.find(item => item.relative.toLowerCase().endsWith(".dll"));
    if (!dll) throw new UsageError(`Installed item '${record.name}' has no managed DLL.`);
    file = path.join(target.rootDir, dll.relative);
  }
  const pe = await inspectDll(file);
  if (!pe.managed) throw new UsageError("plugin inspect currently requires a managed CLR assembly; use 'moddock dll inspect' for native DLLs.");
  const report = await new ManagedInspectorClient().inspect(pe.path);
  const output = new CliOutput(environment.json, environment.quiet);
  if (environment.json) { output.value(report); return; }
  output.value(report, [
    `${report.assembly.name} ${report.assembly.version}`,
    `Classification: ${report.classification}`,
    `Compatibility: ${report.compatibility} (${report.compatibilityLevel})`,
    `Plugins: ${report.plugins.length}`,
    `Unsupported symbols: ${report.unsupportedSymbols.length ? report.unsupportedSymbols.join(", ") : "none detected"}`
  ].join("\n"));
}
