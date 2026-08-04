import { UsageError } from "../../core/errors.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { activeTarget, confirmOrThrow, requiredPosition, shortId } from "./shared.js";

export async function backupCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1] ?? "list";
  const target = action === "recover" ? undefined : await activeTarget(environment);
  const output = new CliOutput(environment.json, environment.quiet);
  if (action === "create") {
    environment.args.ensureOnly("name");
    const snapshot = await environment.context.backups.create(target!, environment.args.get("name"));
    output.value(snapshot, `Created backup '${snapshot.name}' (${shortId(snapshot.id)}).`);
    return;
  }
  if (action === "list") {
    environment.args.ensureOnly();
    const snapshots = await environment.context.backups.list(target!.id);
    if (environment.json) { output.value(snapshots); return; }
    output.table(["ID", "Name", "Files", "Created"], snapshots.map(item => [shortId(item.id), item.name, String(item.files.length), item.createdAt]));
    return;
  }
  if (action === "restore") {
    environment.args.ensureOnly();
    const snapshot = await environment.context.backups.resolve(target!.id, requiredPosition(positionals, 2, "backup name or ID"));
    if (environment.args.has("dry-run")) {
      const plan = await environment.context.backups.restore(target!, snapshot, { dryRun: true });
      output.value(plan, `Dry run: restore ${plan.length} file(s) from '${snapshot.name}'.`);
      return;
    }
    await confirmOrThrow(environment, `Restore '${snapshot.name}' and overwrite its managed files?`);
    const result = await environment.context.backups.restore(target!, snapshot, { force: true });
    output.value(result, `Restored '${snapshot.name}'.`);
    return;
  }
  if (action === "remove") {
    environment.args.ensureOnly();
    const snapshot = await environment.context.backups.resolve(target!.id, requiredPosition(positionals, 2, "backup name or ID"));
    await confirmOrThrow(environment, `Permanently remove backup '${snapshot.name}'?`);
    await environment.context.backups.remove(target!.id, snapshot);
    output.value({ id: snapshot.id, removed: true }, `Removed backup '${snapshot.name}'.`);
    return;
  }
  if (action === "prune") {
    environment.args.ensureOnly("keep");
    const keep = Number(environment.args.require("keep"));
    if (!Number.isInteger(keep) || keep < 0) throw new UsageError("--keep must be a non-negative integer.");
    await confirmOrThrow(environment, `Remove all but the newest ${keep} backup(s)?`);
    const removed = await environment.context.backups.prune(target!.id, keep);
    output.value(removed, `Removed ${removed.length} old backup(s).`);
    return;
  }
  if (action === "recover") {
    environment.args.ensureOnly();
    const result = await environment.context.installer.recoverInterrupted();
    output.value(result, result.length ? `Processed ${result.length} interrupted operation(s).` : "No interrupted operations found.");
    return;
  }
  throw new UsageError(`Unknown backup action: ${action}`);
}
