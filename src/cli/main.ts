import path from "node:path";
import { ModeDockCore } from "../core/core.js";
import { ModeDockCoreError } from "../errors.js";
import { packMod } from "../publisher/pack.js";
import { buildRegistry } from "../publisher/registry-builder.js";
import { createChallengeTemplate } from "../challenge/template.js";
import type { ProfileLockfile, SyncPlan } from "../types.js";
import { Args } from "./args.js";
import { HELP } from "./help.js";
import { Output } from "./output.js";

export async function run(argv = process.argv.slice(2)): Promise<number> {
  if (argv.length === 1 && argv[0] === "--version") { process.stdout.write("0.2.0\n"); return 0; }
  const args = Args.parse(argv);
  if (args.has("help") || !args.positionals.length) { process.stdout.write(HELP); return 0; }
  const output = new Output(args.has("json"));
  const command = args.positionals[0]!;

  if (command === "pack") {
    const source = requiredPositional(args, 1, "mod directory");
    const result = await packMod(source, args.required("out"), { ...(args.get("base-url") ? { baseUrl: args.get("base-url")! } : {}) });
    output.value(result, `Packed ${result.descriptor.manifest.id}@${result.descriptor.manifest.version}\n${result.descriptorPath}`);
    return 0;
  }
  if (command === "registry" && args.positionals[1] === "build") {
    const root = requiredPositional(args, 2, "registry root");
    const out = args.get("out") ?? path.join(root, "registry.json");
    const index = await buildRegistry(root, out, args.get("name") ?? "ModeDOCK Registry", { ...(args.get("base-url") ? { baseUrl: args.get("base-url")! } : {}) });
    output.value(index, `Built registry '${index.name}' with ${Object.keys(index.packages).length} package(s).\n${path.resolve(out)}`);
    return 0;
  }
  if (command === "capsule" && args.positionals[1] === "init") {
    const result = await createChallengeTemplate(requiredPositional(args, 2, "challenge directory"), {
      id: args.required("id"),
      gameId: args.required("game"),
      ...(args.get("title") ? { title: args.get("title")! } : {})
    });
    output.value(result, `Created Challenge Capsule template.\n${result.manifestPath}`);
    return 0;
  }

  const core = await ModeDockCore.open({ ...(args.get("data-dir") ? { dataDir: args.get("data-dir")! } : {}) });
  if (command === "profile") return profileCommand(core, args, output);
  if (command === "registry") return registryCommand(core, args, output);
  if (command === "capsule") return capsuleCommand(core, args, output);
  if (command === "add") {
    const result = await core.add(requiredPositional(args, 1, "profile"), requiredPositional(args, 2, "package"), { dryRun: args.has("dry-run") });
    printSyncResult(output, result); return 0;
  }
  if (command === "remove") {
    const result = await core.remove(requiredPositional(args, 1, "profile"), requiredPositional(args, 2, "package"), { dryRun: args.has("dry-run") });
    printSyncResult(output, result); return 0;
  }
  if (command === "sync") {
    const result = await core.sync(requiredPositional(args, 1, "profile"), { dryRun: args.has("dry-run") });
    printSyncResult(output, result); return 0;
  }
  if (command === "update") {
    const result = await core.update(requiredPositional(args, 1, "profile"), args.positionals[2], { dryRun: args.has("dry-run") });
    printSyncResult(output, result); return 0;
  }
  if (command === "list") {
    const profileId = requiredPositional(args, 1, "profile");
    const lock = await core.profiles.readLock(profileId);
    const packages = lock?.resolutionOrder.map(id => lock.packages[id]) ?? [];
    output.value(packages, packages.length ? packages.map(item => `${item!.id}@${item!.version}  ${item!.name}`).join("\n") : "No packages installed.");
    return 0;
  }
  if (command === "verify") {
    const report = await core.verify(requiredPositional(args, 1, "profile"));
    output.verification(report); return report.ok ? 0 : 2;
  }
  if (command === "transactions") {
    const transactions = await core.pendingTransactions();
    output.value(transactions, transactions.length ? transactions.map(item => `${item.id}  ${item.profileId}  ${item.state}  ${item.createdAt}`).join("\n") : "No pending transactions.");
    return 0;
  }
  if (command === "recover") {
    const transactionId = requiredPositional(args, 1, "transaction ID");
    await core.recover(transactionId);
    output.value({ transactionId, recovered: true }, `Recovered transaction ${transactionId}.`);
    return 0;
  }
  if (command === "doctor") {
    const profileId = requiredPositional(args, 1, "profile");
    const [profile, lock, verification, transactions] = await Promise.all([
      core.profiles.get(profileId), core.profiles.readLock(profileId), core.verify(profileId), core.pendingTransactions()
    ]);
    const report = { profile, lockPresent: Boolean(lock), verification, pendingTransactions: transactions.filter(item => item.profileId === profileId) };
    output.value(report, [
      `Profile: ${profile.name} (${profile.id})`,
      `Game root: ${profile.game.rootDir}`,
      `Registry count: ${profile.registries.length}`,
      `Requirements: ${Object.keys(profile.requirements).length}`,
      `Managed files: ${lock ? Object.keys(lock.files).length : 0}`,
      `Integrity: ${verification.ok ? "OK" : "FAILED"}`,
      `Pending transactions: ${report.pendingTransactions.length}`
    ].join("\n"));
    return verification.ok ? 0 : 2;
  }
  throw new ModeDockCoreError(`Unknown command: ${command}`, "USAGE_ERROR");
}

async function capsuleCommand(core: ModeDockCore, args: Args, output: Output): Promise<number> {
  const action = requiredPositional(args, 1, "capsule action");
  if (action === "inspect") {
    const inspection = await core.challenges.inspect(requiredPositional(args, 2, "capsule file"), args.get("profile"));
    output.value(inspection, [
      `${inspection.capsule.title} (${inspection.capsule.id}@${inspection.capsule.version})`,
      `Integrity: ${inspection.integrity}`,
      `Environment mode: ${inspection.capsule.environment.mode}`,
      `Packages: ${Object.keys(inspection.capsule.environment.packages).length}`,
      ...(inspection.compatible === undefined ? [] : [`Compatible: ${inspection.compatible ? "yes" : "no"}`]),
      ...inspection.compatibilityIssues.map(issue => `  - ${issue}`)
    ].join("\n"));
    return inspection.compatible === false ? 2 : 0;
  }
  if (action === "prepare") {
    const result = await core.challenges.prepare(
      requiredPositional(args, 2, "profile"),
      requiredPositional(args, 3, "capsule file"),
      { dryRun: args.has("dry-run") }
    );
    if (!result.session) {
      output.plan(result.plan);
      return 0;
    }
    output.value(result, [
      `Prepared '${result.inspection.capsule.title}'.`,
      `Session: ${result.session.id}`,
      "Next: arm the session to issue a verifiable ticket."
    ].join("\n"));
    return 0;
  }
  if (action === "arm") {
    const ticket = await core.challenges.arm(requiredPositional(args, 2, "session ID"), {
      ...(args.get("participant") ? { participant: args.get("participant")! } : {})
    });
    output.value(ticket, [
      `Challenge armed: ${ticket.capsuleId}@${ticket.capsuleVersion}`,
      `Session: ${ticket.sessionId}`,
      `Ticket: ${ticket.id}`,
      `Environment: ${ticket.environmentHash}`,
      "ModeDOCK will not launch the game. Start it manually or through your launcher, then finish the session."
    ].join("\n"));
    return 0;
  }
  if (action === "finish") {
    const finished = await core.challenges.finish(requiredPositional(args, 2, "session ID"), {
      claims: parseClaims(args.all("claim")),
      ...(args.get("out") ? { outputDir: args.get("out")! } : {}),
      restore: args.has("restore")
    });
    output.value(finished, [
      `Challenge result: ${finished.result.verdict.valid ? "VALID" : "INCOMPLETE"}`,
      `Result: ${finished.resultPath}`,
      `Environment stable: ${finished.result.environmentStable ? "yes" : "no"}`,
      `Evidence items: ${finished.result.evidence.length}`,
      ...finished.result.verdict.reasons.map(reason => `  - ${reason}`),
      ...(args.has("restore") ? ["Original profile requirements restored."] : ["Run capsule restore when you are ready to return to the previous profile."])
    ].join("\n"));
    return finished.result.verdict.valid ? 0 : 2;
  }
  if (action === "restore") {
    const restored = await core.challenges.restore(requiredPositional(args, 2, "session ID"), { dryRun: args.has("dry-run") });
    if (!restored.session) { output.plan(restored.plan); return 0; }
    output.value(restored, `Restored profile '${restored.session.profileId}' after challenge '${restored.session.capsule.title}'.`);
    return 0;
  }
  if (action === "status") {
    const sessionId = args.positionals[2];
    if (sessionId) {
      const session = await core.challenges.get(sessionId);
      output.value(session, JSON.stringify(session, null, 2));
      return 0;
    }
    const sessions = await core.challenges.list();
    output.value(sessions, sessions.length ? sessions.map(session => `${session.id}  ${session.status.padEnd(10)}  ${session.capsule.id}@${session.capsule.version}`).join("\n") : "No challenge sessions.");
    return 0;
  }
  throw new ModeDockCoreError(`Unknown capsule action: ${action}`, "USAGE_ERROR");
}

function parseClaims(values: string[]): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new ModeDockCoreError(`Invalid claim: ${value}`, "USAGE_ERROR");
    const key = value.slice(0, separator);
    const raw = value.slice(separator + 1);
    if (raw === "true" || raw === "false") result[key] = raw === "true";
    else if (/^-?(?:\d+|\d*\.\d+)$/.test(raw)) result[key] = Number(raw);
    else result[key] = raw;
  }
  return result;
}

async function profileCommand(core: ModeDockCore, args: Args, output: Output): Promise<number> {
  const action = requiredPositional(args, 1, "profile action");
  if (action === "create") {
    const destinations = parseDestinations(args.all("dest"));
    const profile = await core.createProfile({
      id: requiredPositional(args, 2, "profile ID"),
      gameId: args.required("game"),
      rootDir: args.required("root"),
      ...(args.get("name") ? { name: args.get("name")! } : {}),
      ...(args.get("version") ? { gameVersion: args.get("version")! } : {}),
      ...(args.get("loader") ? { loaderId: args.get("loader")! } : {}),
      ...(args.get("loader-version") ? { loaderVersion: args.get("loader-version")! } : {}),
      ...(Object.keys(destinations).length ? { destinations } : {})
    });
    output.value(profile, `Created profile '${profile.id}' for ${profile.game.id}.`); return 0;
  }
  if (action === "list") {
    const profiles = await core.profiles.list();
    output.value(profiles, profiles.length ? profiles.map(profile => `${profile.id}  ${profile.name}  ${profile.game.rootDir}`).join("\n") : "No profiles."); return 0;
  }
  if (action === "show") {
    const profile = await core.profiles.get(requiredPositional(args, 2, "profile ID"));
    output.value(profile, JSON.stringify(profile, null, 2)); return 0;
  }
  if (action === "delete") {
    const profileId = requiredPositional(args, 2, "profile ID");
    await core.profiles.remove(profileId);
    output.value({ profileId, deleted: true }, `Deleted profile '${profileId}'.`); return 0;
  }
  throw new ModeDockCoreError(`Unknown profile action: ${action}`, "USAGE_ERROR");
}

async function registryCommand(core: ModeDockCore, args: Args, output: Output): Promise<number> {
  const action = requiredPositional(args, 1, "registry action");
  if (action === "add") {
    const profile = await core.addRegistry(
      requiredPositional(args, 2, "profile"),
      { name: requiredPositional(args, 3, "registry name"), location: requiredPositional(args, 4, "registry location") }
    );
    output.value(profile.registries, `Added registry '${profile.registries.at(-1)!.name}'.`); return 0;
  }
  if (action === "remove") {
    const profile = await core.removeRegistry(requiredPositional(args, 2, "profile"), requiredPositional(args, 3, "registry name"));
    output.value(profile.registries, "Registry removed."); return 0;
  }
  throw new ModeDockCoreError(`Unknown registry action: ${action}`, "USAGE_ERROR");
}

function printSyncResult(output: Output, result: SyncPlan | ProfileLockfile): void {
  if ("operations" in result) output.plan(result); else output.lock(result);
}

function requiredPositional(args: Args, index: number, label: string): string {
  const value = args.positionals[index];
  if (!value) throw new ModeDockCoreError(`Missing ${label}.`, "USAGE_ERROR");
  return value;
}

function parseDestinations(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) throw new ModeDockCoreError(`Invalid destination mapping: ${value}`, "USAGE_ERROR");
    result[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return result;
}
