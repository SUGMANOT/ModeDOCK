import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { activeTarget, confirmOrThrow, requiredPosition, shortId } from "./shared.js";

export async function installCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  environment.args.ensureOnly("destination");
  const source = requiredPosition(positionals, 1, "source path");
  const target = await activeTarget(environment);
  const options = { destination: environment.args.get("destination"), force: environment.args.has("force"), dryRun: environment.args.has("dry-run"), noBackup: environment.args.has("no-backup") };
  const plan = await environment.context.installer.plan(source, target, options);
  const output = new CliOutput(environment.json, environment.quiet);
  if (options.dryRun) {
    output.value(plan, `Dry run: ${plan.files.length} file(s), ${plan.totalBytes} byte(s), ${plan.overwrites.length} overwrite(s).\n${plan.files.map(item => `  ${item.exists ? "replace" : "create"} ${item.targetRelative}`).join("\n")}`);
    return;
  }
  if (plan.overwrites.length && !options.force) await confirmOrThrow(environment, `Install '${plan.name}' and overwrite ${plan.overwrites.length} file(s)?`);
  const record = await environment.ui.spinner(`Installing ${plan.name}...`, () => environment.context.installer.install(plan, { ...options, force: options.force || plan.overwrites.length > 0 }));
  output.value(record, `Installed '${record.name}' (${record.files.length} file(s), ID ${shortId(record.id)}).`);
}

export async function listCommand(environment: CommandEnvironment): Promise<void> {
  environment.args.ensureOnly();
  const target = await activeTarget(environment);
  const records = await environment.context.installationStore.list(target.id);
  const rows = await Promise.all(records.map(async record => ({ record, health: await environment.context.installer.health(target, record) })));
  const output = new CliOutput(environment.json, environment.quiet);
  if (environment.json) { output.value(rows.map(item => ({ ...item.record, status: item.health }))); return; }
  output.table(["ID", "Name", "Status", "Files", "Installed"], rows.map(item => [shortId(item.record.id), item.record.name, item.health, String(item.record.files.length), item.record.installedAt]));
}

export async function infoCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  environment.args.ensureOnly();
  const target = await activeTarget(environment);
  const record = await environment.context.installationStore.resolve(target.id, requiredPosition(positionals, 1, "mod or plugin name/ID"));
  const health = await environment.context.installer.health(target, record);
  new CliOutput(environment.json, environment.quiet).value({ ...record, status: health });
}

export async function mutateModCommand(environment: CommandEnvironment, positionals: string[], action: "enable" | "disable" | "remove" | "reinstall"): Promise<void> {
  environment.args.ensureOnly("destination");
  const target = await activeTarget(environment);
  const record = await environment.context.installationStore.resolve(target.id, requiredPosition(positionals, 1, "mod or plugin name/ID"));
  const output = new CliOutput(environment.json, environment.quiet);
  const previewAction = action === "reinstall" ? "remove" : action;
  const preview = await environment.context.installer.preview(target, record, previewAction);
  if (environment.args.has("dry-run")) {
    output.value({ action, target: target.name, item: record.name, changes: preview }, `Dry run: ${action} '${record.name}'\n${preview.map(item => `  ${item.action}: ${item.path}`).join("\n")}`);
    return;
  }
  if (action === "remove") {
    await confirmOrThrow(environment, `Remove '${record.name}' and restore original files?`);
    await environment.context.installer.remove(target, record, environment.args.has("force"));
    output.value({ id: record.id, removed: true }, `Removed '${record.name}'.`);
  } else if (action === "reinstall") {
    if (!environment.args.has("force")) await confirmOrThrow(environment, `Reinstall '${record.name}' from ${record.sourcePath}?`);
    const replacement = await environment.context.installer.reinstall(target, record, { destination: environment.args.get("destination"), force: true, noBackup: environment.args.has("no-backup") });
    output.value(replacement, `Reinstalled '${replacement.name}'.`);
  } else {
    await environment.context.installer[action](target, record, environment.args.has("force"));
    output.value({ id: record.id, enabled: action === "enable" }, `${action === "enable" ? "Enabled" : "Disabled"} '${record.name}'.`);
  }
}
