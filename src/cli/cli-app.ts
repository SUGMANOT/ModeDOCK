import type { AppContext } from "../core/app-context.js";
import { UsageError } from "../core/errors.js";
import { ParsedArgs } from "./args.js";
import { backupCommand } from "./commands/backup.js";
import { configCommand } from "./commands/config.js";
import { infoCommand, installCommand, listCommand, mutateModCommand } from "./commands/mods.js";
import type { CommandEnvironment } from "./commands/shared.js";
import { systemCommand } from "./commands/system.js";
import { targetCommand } from "./commands/target.js";
import { dllCommand } from "./commands/dll.js";
import { pluginCommand } from "./commands/plugin.js";
import { TerminalUI } from "./ui/terminal.js";
import { launchCommand, runtimeCommand } from "./commands/runtime.js";

export async function runDirect(context: AppContext, args: ParsedArgs): Promise<void> {
  const positionals = args.positionals;
  const command = positionals[0];
  if (!command) throw new UsageError("No direct command was supplied.");
  const environment: CommandEnvironment = {
    context, args, json: args.has("json"), quiet: args.has("quiet"),
    ui: new TerminalUI(context.config.get("theme"), "compact", context.config.get("language"))
  };
  if (await systemCommand(environment, positionals)) return;
  if (command === "target") return targetCommand(environment, positionals);
  if (command === "backup") return backupCommand(environment, positionals);
  if (command === "config") return configCommand(environment, positionals);
  if (command === "dll") return dllCommand(environment, positionals);
  if (command === "plugin") return pluginCommand(environment, positionals);
  if (command === "runtime") return runtimeCommand(environment, positionals);
  if (command === "launch") return launchCommand(environment, positionals);
  if (command === "install") return installCommand(environment, positionals);
  if (command === "list") return listCommand(environment);
  if (command === "info" || command === "inspect") return infoCommand(environment, positionals);
  if (["enable", "disable", "remove", "reinstall"].includes(command))
    return mutateModCommand(environment, positionals, command as "enable" | "disable" | "remove" | "reinstall");
  throw new UsageError(`Unknown command: ${command}. Run 'moddock --help'.`);
}
