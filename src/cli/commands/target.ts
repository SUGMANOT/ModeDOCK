import type { TargetProfile } from "../../types/index.js";
import { UsageError } from "../../core/errors.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { commaList, confirmOrThrow, requiredPosition, shortId } from "./shared.js";

export async function targetCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1] ?? "list";
  const output = new CliOutput(environment.json, environment.quiet);
  if (action === "list") {
    environment.args.ensureOnly();
    const targets = await environment.context.targets.list();
    if (environment.json) { output.value(targets); return; }
    const active = environment.context.config.get("defaultTarget");
    output.table(["Active", "ID", "Name", "Adapter", "Root"], targets.map(item => [item.id === active ? "*" : "", shortId(item.id), item.name, item.adapterId, item.rootDir]));
    return;
  }
  if (action === "add") {
    environment.args.ensureOnly("name", "root", "exe", "mods-dir", "plugins-dir", "config-dir", "loader", "extensions", "adapter");
    const target = await environment.context.targets.add(await profileInput(environment));
    output.value(target, `Created target '${target.name}' (${shortId(target.id)}).`);
    return;
  }
  if (action === "edit") {
    environment.args.ensureOnly("name", "root", "exe", "mods-dir", "plugins-dir", "config-dir", "loader", "extensions", "adapter");
    const selector = requiredPosition(positionals, 2, "target name or ID");
    const changes = profileChanges(environment);
    if (!Object.keys(changes).length) throw new UsageError("No target changes were supplied.");
    const target = await environment.context.targets.edit(selector, changes);
    output.value(target, `Updated target '${target.name}'.`);
    return;
  }
  if (action === "select") {
    environment.args.ensureOnly();
    const target = await environment.context.targets.select(requiredPosition(positionals, 2, "target name or ID"));
    output.value(target, `Selected target '${target.name}'.`);
    return;
  }
  if (action === "inspect") {
    environment.args.ensureOnly();
    const target = await environment.context.targets.active(positionals[2] ?? environment.args.get("target"));
    output.value(environment.context.targets.inspect(target));
    return;
  }
  if (action === "validate") {
    environment.args.ensureOnly("all");
    const validations = await environment.context.targets.validate(environment.args.has("all") ? undefined : positionals[2] ?? environment.args.get("target"));
    if (environment.json) { output.value(validations); return; }
    output.table(["Target", "Status", "Details"], validations.map(item => [item.target.name, item.issues.length ? "error" : "ok", item.issues.join("; ") || "Valid"]));
    return;
  }
  if (action === "remove") {
    environment.args.ensureOnly();
    const selector = requiredPosition(positionals, 2, "target name or ID");
    const target = await environment.context.targets.active(selector);
    await confirmOrThrow(environment, `Remove target profile '${target.name}'?`);
    const removed = await environment.context.targets.remove(selector, environment.args.has("force"));
    output.value(removed, `Removed target profile '${removed.name}'. Target application files were not deleted.`);
    return;
  }
  if (action === "detect") {
    environment.args.ensureOnly("adapter", "add");
    const detected = await environment.context.targets.detect(environment.args.get("adapter"));
    const add = environment.args.get("add");
    if (add) {
      const matches = detected.filter(item => item.detectionId === add || item.detectionId.startsWith(add));
      if (matches.length !== 1) throw new UsageError(matches.length ? `Detection selector '${add}' is ambiguous.` : `Detection not found: ${add}`);
      const target = await environment.context.targets.addDetected(matches[0]!);
      output.value(target, `Added detected target '${target.name}'.`);
      return;
    }
    if (environment.json) { output.value(detected); return; }
    output.table(["ID", "Name", "Adapter", "Confidence", "Root"], detected.map(item => [shortId(item.detectionId), item.name, item.adapterId, item.confidence, item.rootDir]));
    return;
  }
  throw new UsageError(`Unknown target action: ${action}`);
}

async function profileInput(environment: CommandEnvironment): Promise<Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">> {
  let rootDir = environment.args.get("root") ?? "";
  if (environment.ui.interactive) rootDir ||= await environment.ui.prompt("Installation directory");
  if (!rootDir) throw new UsageError("target add requires only --root <installation-directory>; name, executable, loader, and mod paths are detected automatically.");
  const analyzed = await environment.context.targets.analyze(rootDir, environment.args.get("exe"), environment.args.get("name"));
  return { ...analyzed, ...profileChanges(environment), rootDir };
}

function profileChanges(environment: CommandEnvironment): Partial<TargetProfile> {
  const value: Partial<TargetProfile> = {};
  const map: Array<[string, keyof TargetProfile]> = [
    ["name", "name"], ["root", "rootDir"], ["exe", "executable"], ["mods-dir", "modsDir"],
    ["plugins-dir", "pluginsDir"], ["config-dir", "configDir"], ["loader", "loader"], ["adapter", "adapterId"]
  ];
  for (const [option, key] of map) {
    const candidate = environment.args.get(option);
    if (candidate !== undefined) (value as Record<string, unknown>)[key] = candidate;
  }
  const extensions = commaList(environment.args.get("extensions"));
  if (extensions) value.supportedExtensions = extensions;
  return value;
}
