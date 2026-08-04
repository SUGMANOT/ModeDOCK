import { ModeDockError } from "../../core/errors.js";
import { VERSION } from "../../core/version.js";
import { CliOutput } from "../output.js";
import { printHelp } from "../help.js";
import type { CommandEnvironment } from "./shared.js";

export async function systemCommand(environment: CommandEnvironment, positionals: string[]): Promise<boolean> {
  const command = positionals[0];
  const output = new CliOutput(environment.json, environment.quiet);
  if (command === "init") {
    environment.args.ensureOnly();
    output.value({ dataDir: environment.context.paths.root, config: environment.context.config.file }, `ModeDOCK initialized at ${environment.context.paths.root}`);
    return true;
  }
  if (command === "doctor") {
    environment.args.ensureOnly();
    const checks = await environment.context.doctor.run(environment.args.get("target"));
    if (environment.json) output.value(checks);
    else output.table(["Status", "Check", "Details"], checks.map(item => [item.status, item.name, item.message]));
    if (checks.some(item => item.status === "error")) process.exitCode = 1;
    return true;
  }
  if (command === "paths") {
    environment.args.ensureOnly();
    output.value({ data: environment.context.paths.root, config: environment.context.config.file, targets: environment.context.paths.targets, installations: environment.context.paths.installations, backups: environment.context.paths.backups, logs: environment.context.paths.logs });
    return true;
  }
  if (command === "update") {
    environment.args.ensureOnly();
    const result = await environment.context.update.check();
    if (environment.args.has("force")) {
      const exitCode = await environment.context.update.install();
      if (exitCode) throw new ModeDockError(`npm exited with code ${exitCode}.`, "UPDATE_FAILED");
    }
    output.value(result, result.updateAvailable ? `Update available: ${result.current} -> ${result.latest}${environment.args.has("force") ? " (installed)" : ""}` : `ModeDOCK ${VERSION} is current.`);
    return true;
  }
  if (command === "help") { printHelp(positionals[1]); return true; }
  return false;
}
