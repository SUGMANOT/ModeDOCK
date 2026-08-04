import { UsageError } from "../../core/errors.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { confirmOrThrow, requiredPosition, shortId } from "./shared.js";

export async function runtimeCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1];
  if (!action || !["status", "install", "uninstall", "doctor"].includes(action)) throw new UsageError(`Unknown runtime action: ${action ?? "<missing>"}. Run 'moddock help runtime'.`);
  environment.args.ensureOnly();
  const selector = positionals[2] ?? environment.args.get("target");
  const target = await environment.context.targets.active(selector);
  const output = new CliOutput(environment.json, environment.quiet);
  if (action === "status") { const status = await environment.context.runtime.status(target); output.value(status, runtimeStatusText(status)); return; }
  if (action === "doctor") {
    const checks = await environment.context.runtime.doctor(target);
    if (environment.json) output.value(checks); else output.table(["Status", "Check", "Details"], checks.map(check => [check.status, check.name, check.message]));
    if (checks.some(check => check.status === "error")) process.exitCode = 1;
    return;
  }
  if (action === "install") {
    const result = await environment.context.runtime.install(target, { dryRun: environment.args.has("dry-run"), force: environment.args.has("force") });
    if ("totalBytes" in result) output.value(result, `Dry run: create ${result.files.length} runtime file(s), ${result.totalBytes} byte(s).`);
    else output.value(result, `Installed ModeDOCK Runtime (${result.files.length} file(s), ID ${shortId(result.id)}).`);
    return;
  }
  if (environment.args.has("dry-run")) { const preview = await environment.context.runtime.uninstall(target, { dryRun: true }); output.value(preview, `Dry run: ${(preview as unknown[]).length} runtime file change(s).`); return; }
  await confirmOrThrow(environment, `Uninstall ModeDOCK Runtime from '${target.name}' and restore original files?`);
  const removed = await environment.context.runtime.uninstall(target, { force: environment.args.has("force") });
  output.value(removed, "ModeDOCK Runtime uninstalled.");
}

export async function launchCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  environment.args.ensureOnly("profile");
  const target = await environment.context.targets.active(positionals[1] ?? environment.args.get("target"));
  const profile = environment.args.get("profile") ?? target.id;
  const result = await environment.context.runtime.launch(target, profile);
  new CliOutput(environment.json, environment.quiet).value(result, result.exitCode === 0 ? `Launch completed for '${target.name}'.` : `Launch exited with code ${result.exitCode}.`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function runtimeStatusText(status: Awaited<ReturnType<CommandEnvironment["context"]["runtime"]["status"]>>): string {
  return [
    `Target: ${status.target}`,
    `Supported: ${status.supported ? "yes" : "no"}`,
    `Adapter: ${status.adapter ?? "none"}`,
    `Installed: ${status.installed ? "yes" : "no"}`,
    `Compatibility: BepInEx ${status.runtimeCompatibility.bepInEx}, Harmony ${status.runtimeCompatibility.harmony}, Native ${status.runtimeCompatibility.native}`,
    ...status.limitations.map(item => `Limitation: ${item}`)
  ].join("\n");
}
