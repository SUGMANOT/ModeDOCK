import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipSync } from "fflate";
import { ParsedArgs } from "../src/cli/args.js";
import { createAppContext, type AppContext } from "../src/core/app-context.js";
import { ModeDockError } from "../src/core/errors.js";
import { AdapterRegistry } from "../src/adapters/adapter-registry.js";
import { StandardTargetAdapter } from "../src/adapters/targets/standard-adapter.js";
import { DEFAULT_CONFIG, ConfigService } from "../src/services/config/config-service.js";
import { ensureInside, normalizeRelative } from "../src/services/filesystem/safe-fs.js";
import { inspectDll, inspectPortableExecutable } from "../src/runtime/inspection/pe-inspector.js";
import { NativeProbeClient } from "../src/runtime/probe/native-probe-client.js";
import { ManagedInspectorClient, type ManagedInspectionReport } from "../src/runtime/inspection/managed-inspector-client.js";
import { buildPluginGraph, type ManagedPluginCandidate } from "../src/runtime/managed/plugin-graph.js";
import { ManagedRuntimeClient } from "../src/runtime/managed/managed-runtime-client.js";
import { ManagedPluginPlanner } from "../src/runtime/managed/managed-plugin-planner.js";
import { HarmonyHarnessClient } from "../src/runtime/managed/harmony-harness-client.js";
import { generateRuntimeManifest, validateRuntimeManifest } from "../src/runtime/manifest/runtime-manifest.js";

async function fixture(): Promise<{ root: string; data: string; targetRoot: string; context: AppContext }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-test-"));
  const data = path.join(root, "state");
  const targetRoot = path.join(root, "target");
  await mkdir(targetRoot, { recursive: true });
  await writeFile(path.join(targetRoot, "game.exe"), "test executable");
  await mkdir(data, { recursive: true });
  await writeFile(path.join(data, "migration.json"), JSON.stringify({ completedAt: new Date().toISOString() }));
  const context = await createAppContext({ dataDir: data });
  await context.initialize();
  return { root, data, targetRoot, context };
}

test("CLI parser handles direct commands, aliases, values, and boolean flags", () => {
  const parsed = ParsedArgs.parse(["install", "plugin.dll", "-t", "Game", "--dry-run", "--json"]);
  assert.deepEqual(parsed.positionals, ["install", "plugin.dll"]);
  assert.equal(parsed.get("target"), "Game");
  assert.equal(parsed.has("dry-run"), true);
  assert.equal(parsed.has("json"), true);
  assert.throws(() => ParsedArgs.parse(["--target"]), /requires a value/);
});

test("static DLL inspection identifies the immutable ModeDOCK Native ABI v1 fixture", async () => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "ModeDOCK_DeadCells_Test(1).dll");
  const before = await readFile(fixturePath);
  const report = await inspectDll(`"${fixturePath}"`);
  const after = await readFile(fixturePath);

  assert.equal(report.sha256, "afa645eb193116ca426ef9e86a1b9426e87d59da02e39b6269f4cb8a53c4a8bb");
  assert.equal(report.size, 2048);
  assert.equal(report.format, "PE32+");
  assert.equal(report.architecture, "x64");
  assert.equal(report.kind, "native");
  assert.equal(report.hasClrHeader, false);
  assert.deepEqual(report.imports, []);
  assert.deepEqual(report.exports, [
    "ModeDOCK_GetApiVersion",
    "ModeDOCK_GetDescription",
    "ModeDOCK_GetName",
    "ModeDOCK_TestPing"
  ]);
  assert.equal(report.detectedRuntime, "modedock-native-abi-v1");
  assert.equal(report.nativeAbi.level, "N1");
  assert.equal(report.bepInExCompatible, false);
  assert.equal(report.harmonyReferences, false);
  assert.deepEqual(after, before, "static inspection must not modify or execute the fixture");
});

test("static DLL inspection rejects truncated and non-PE input with a machine-readable code", () => {
  for (const bytes of [new Uint8Array(), new TextEncoder().encode("not a DLL")]) {
    assert.throws(() => inspectPortableExecutable(bytes), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_PE");
  }
});

test("native ABI fixture generates the exact safe local runtime manifest", async () => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "ModeDOCK_DeadCells_Test(1).dll");
  const manifest = await generateRuntimeManifest(fixturePath);
  assert.deepEqual(manifest, { schemaVersion: 1, id: "modedock.dead-cells-test", name: "ModeDOCK Dead Cells Test DLL", version: "0.0.0-test", runtime: "modedock-native-abi-v1", architecture: "x64", entrypoints: ["ModeDOCK_DeadCells_Test(1).dll"], capabilities: ["metadata", "self-test"], gameModification: false });
  assert.deepEqual(validateRuntimeManifest(manifest), manifest);
  assert.throws(() => validateRuntimeManifest({ ...manifest, entrypoints: ["../escape.dll"] }), (error: unknown) => error instanceof Error && "code" in error && error.code === "RUNTIME_MANIFEST_INVALID");
});

test("isolated native probe executes the N1 self-test without loading the DLL into the CLI process", { skip: process.platform !== "win32" }, async () => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "ModeDOCK_DeadCells_Test(1).dll");
  const before = await readFile(fixturePath);
  const result = await new NativeProbeClient().probe(fixturePath);
  const after = await readFile(fixturePath);
  assert.deepEqual(result, {
    apiVersion: 1,
    name: "ModeDOCK Dead Cells Test DLL",
    description: "Inert Windows x64 test DLL for ModeDOCK file-management checks; no injection or game modification.",
    ping: 1,
    status: "ok",
    executed: true
  });
  assert.deepEqual(after, before);
});

test("native probe client contains helper timeouts and crashes", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-probe-client-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const helper = path.join(root, "fake-helper.mjs");
  await writeFile(helper, `const mode=process.argv[2]; if(mode==="timeout") setTimeout(()=>{}, 60000); else process.exit(17);`);
  const timeoutClient = new NativeProbeClient({ executable: process.execPath, prefixArgs: [helper, "timeout"], timeoutMs: 50 });
  await assert.rejects(() => timeoutClient.probe("fixture.dll"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "PROBE_TIMEOUT");
  const crashClient = new NativeProbeClient({ executable: process.execPath, prefixArgs: [helper, "crash"], timeoutMs: 2_000 });
  await assert.rejects(() => crashClient.probe("fixture.dll"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "PROBE_CRASHED");
});

test("managed inspector classifies synthetic BepInEx metadata without executing plugin code", { skip: process.platform !== "win32" }, async () => {
  const plugin = path.join(process.cwd(), "tests", "fixtures", "managed", "ModeDOCK.SyntheticBepInExPlugin.dll");
  const report = await new ManagedInspectorClient().inspect(plugin);
  assert.equal(report.assembly.name, "ModeDOCK.SyntheticBepInExPlugin");
  assert.equal(report.assembly.targetFramework, ".NETCoreApp,Version=v10.0");
  assert.deepEqual(report.assembly.references.map(reference => reference.name).filter(name => ["BepInEx", "UnityEngine"].includes(name)), ["BepInEx", "UnityEngine"]);
  assert.equal(report.classification, "bepinex5-unity-mono");
  assert.equal(report.compatibility, "partial");
  assert.equal(report.compatibilityLevel, "B0");
  assert.equal(report.plugins.length, 1);
  assert.equal(report.plugins[0]!.guid, "com.modedock.synthetic");
  assert.equal(report.plugins[0]!.name, "ModeDOCK Synthetic Plugin");
  assert.equal(report.plugins[0]!.version, "1.2.3");
  assert.deepEqual(report.plugins[0]!.processes, ["ModeDOCK.SampleUnityMonoGame.exe"]);
  assert.deepEqual(report.plugins[0]!.dependencies, [
    { guid: "com.modedock.required", kind: "hard" },
    { guid: "com.modedock.optional", kind: "soft" }
  ]);
  assert.deepEqual(report.plugins[0]!.incompatibilities, ["com.modedock.incompatible"]);
  assert.equal(report.plugins[0]!.usesBaseUnityPlugin, true);
  assert.equal(report.signals.harmonyReferences, false);
  assert.deepEqual(report.unsupportedSymbols, []);
});

test("managed inspector and planner explicitly reject an unsupported Harmony Transpiler", { skip: process.platform !== "win32" }, async () => {
  const plugin = path.join(process.cwd(), "tests", "fixtures", "managed", "ModeDOCK.HarmonyUnsupportedPlugin.dll");
  const report = await new ManagedInspectorClient().inspect(plugin);
  assert.equal(report.signals.harmonyReferences, true);
  assert.ok(report.unsupportedSymbols.includes("HarmonyLib.HarmonyTranspiler (controlled H4 only; plugin load plans reject)"));
  const paths = { gameRootPath: "C:\\fixture", gameDataPath: "", managedPath: "", bepInExRootPath: "", pluginPath: path.dirname(plugin), configPath: "", cachePath: "", processName: "FixtureGame", executablePath: "" };
  await assert.rejects(() => new ManagedPluginPlanner().createPlan([plugin], paths, "C:\\fixture\\runtime.jsonl"), (error: unknown) => error instanceof Error && "code" in error && error.code === "UNSUPPORTED_HARMONY_API");
});

test("B1 plugin graph filters processes, orders dependencies, and rejects invalid graphs", () => {
  const candidate = (guid: string, dependencies: Array<{ guid: string; kind: "hard" | "soft" }> = [], processes: string[] = [], incompatibilities: string[] = []): ManagedPluginCandidate => ({
    file: `${guid}.dll`,
    inspection: {} as ManagedInspectionReport,
    plugin: { typeName: `${guid}.Plugin`, guid, name: guid, version: "1.0.0", processes, dependencies, incompatibilities, usesBaseUnityPlugin: true, harmonyAttributes: [] }
  });
  const core = candidate("core");
  const addon = candidate("addon", [{ guid: "core", kind: "hard" }]);
  const filtered = candidate("other-game", [], ["Other.exe"]);
  const result = buildPluginGraph([addon, filtered, core], "FixtureGame.exe");
  assert.deepEqual(result.ordered.map(item => item.plugin.guid), ["core", "addon"]);
  assert.deepEqual(result.filtered, [{ guid: "other-game", reason: "process-mismatch:FixtureGame.exe" }]);
  assert.throws(() => buildPluginGraph([candidate("broken", [{ guid: "missing", kind: "hard" }])], "game"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "PLUGIN_DEPENDENCY_MISSING");
  assert.throws(() => buildPluginGraph([candidate("a", [{ guid: "b", kind: "hard" }]), candidate("b", [{ guid: "a", kind: "hard" }])], "game"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "PLUGIN_DEPENDENCY_CYCLE");
  assert.throws(() => buildPluginGraph([candidate("a", [], [], ["b"]), candidate("b")], "game"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "PLUGIN_INCOMPATIBILITY");
  assert.throws(() => buildPluginGraph([candidate("same"), candidate("same")], "game"), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "DUPLICATE_PLUGIN_GUID");
});

test("B1 planner inspects real assemblies before producing a dependency-ordered load plan", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "managed");
  const paths = {
    gameRootPath: "C:\\fixture", gameDataPath: "C:\\fixture\\Data", managedPath: "C:\\fixture\\Managed",
    bepInExRootPath: "C:\\fixture\\ModeDOCK", pluginPath: fixtureDir, configPath: "C:\\fixture\\config",
    cachePath: "C:\\fixture\\cache", processName: "ModeDOCK.SampleUnityMonoGame.exe", executablePath: "C:\\fixture\\ModeDOCK.SampleUnityMonoGame.exe"
  };
  const result = await new ManagedPluginPlanner().createPlan([
    path.join(fixtureDir, "ModeDOCK.SyntheticBepInExPlugin.dll"),
    path.join(fixtureDir, "ModeDOCK.RequiredBepInExPlugin.dll")
  ], paths, "C:\\fixture\\runtime.jsonl");
  assert.deepEqual(result.plan.plugins.map(plugin => plugin.guid), ["com.modedock.required", "com.modedock.synthetic"]);
  assert.equal(result.inspections.length, 2);
  assert.deepEqual(result.filtered, []);
});

test("B2 controlled chainloader initializes paths, config, logging, and plugin Info before Awake", { skip: process.platform !== "win32" }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-managed-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "config");
  const logPath = path.join(root, "runtime.jsonl");
  const plugin = path.join(process.cwd(), "tests", "fixtures", "managed", "ModeDOCK.SyntheticBepInExPlugin.dll");
  const plan = path.join(root, "plan.json");
  await writeFile(plan, JSON.stringify({
    paths: {
      gameRootPath: root, gameDataPath: path.join(root, "Data"), managedPath: path.join(root, "Managed"),
      bepInExRootPath: path.join(root, "ModeDOCK"), pluginPath: path.dirname(plugin), configPath,
      cachePath: path.join(root, "cache"), processName: "FixtureGame", executablePath: path.join(root, "FixtureGame.exe")
    },
    logPath,
    plugins: [{ location: plugin, typeName: "ModeDOCK.SyntheticPlugin.FixturePlugin", guid: "com.modedock.synthetic", name: "ModeDOCK Synthetic Plugin", version: "1.2.3" }]
  }));
  const report = await new ManagedRuntimeClient().loadPlan(plan);
  assert.equal(report.status, "ok");
  assert.deepEqual(report.plugins, [{ guid: "com.modedock.synthetic", state: "loaded", error: null }]);
  assert.equal(report.managerPersistent, true);
  assert.match(report.logs[0]!.message, new RegExp(`root=${root.replaceAll("\\", "\\\\")}`));
  assert.match(report.logs[0]!.message, /enabled=True; count=3; ratio=1\.5; mode=Safe; label=fixture; shortcut=Ctrl \+ F8/);
  const savedConfig = path.join(configPath, "com.modedock.synthetic.cfg");
  const initialConfig = await readFile(savedConfig, "utf8");
  for (const expected of ["Enabled = True", "Count = 3", "Ratio = 1.5", "Mode = Safe", "Label = fixture", "Shortcut = Ctrl + F8"]) assert.match(initialConfig, new RegExp(expected.replace("+", "\\+")));
  assert.match(await readFile(logPath, "utf8"), /Synthetic Awake/);

  await writeFile(savedConfig, "[General]\nEnabled = False\nCount = 99\nRatio = 2.25\nMode = Fast\nLabel = restored\n\n[Input]\nShortcut = Alt + F9\n");
  const restored = await new ManagedRuntimeClient().loadPlan(plan);
  assert.equal(restored.status, "ok");
  assert.match(restored.logs[0]!.message, /enabled=False; count=5; ratio=2\.25; mode=Fast; label=restored; shortcut=Alt \+ F9/);
  assert.match(await readFile(savedConfig, "utf8"), /Count = 5/, "acceptable range must clamp restored values");
});

test("B2 chainloader isolates a plugin throwing in Awake and continues loading other plugins", { skip: process.platform !== "win32" }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-managed-isolation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "managed");
  const plan = path.join(root, "plan.json");
  await writeFile(plan, JSON.stringify({
    paths: {
      gameRootPath: root, gameDataPath: path.join(root, "Data"), managedPath: path.join(root, "Managed"),
      bepInExRootPath: path.join(root, "ModeDOCK"), pluginPath: fixtureDir, configPath: path.join(root, "config"),
      cachePath: path.join(root, "cache"), processName: "FixtureGame", executablePath: path.join(root, "FixtureGame.exe")
    },
    logPath: path.join(root, "runtime.jsonl"),
    plugins: [
      { location: path.join(fixtureDir, "ModeDOCK.ThrowingBepInExPlugin.dll"), typeName: "ModeDOCK.ThrowingPlugin.ThrowingPlugin", guid: "com.modedock.throwing", name: "ModeDOCK Throwing Plugin", version: "1.0.0" },
      { location: path.join(fixtureDir, "ModeDOCK.SyntheticBepInExPlugin.dll"), typeName: "ModeDOCK.SyntheticPlugin.FixturePlugin", guid: "com.modedock.synthetic", name: "ModeDOCK Synthetic Plugin", version: "1.2.3" }
    ]
  }));
  const report = await new ManagedRuntimeClient().loadPlan(plan);
  assert.equal(report.status, "partial-failure");
  assert.equal(report.plugins[0]!.state, "error");
  assert.match(report.plugins[0]!.error ?? "", /Synthetic Awake failure/);
  assert.equal(report.plugins[1]!.state, "loaded");
  assert.match(report.logs[0]!.message, /Synthetic Awake/);
});

test("H1-H4 cooperative shim executes Prefix/Postfix/Finalizer and validated IL pipeline semantics", { skip: process.platform !== "win32" }, async () => {
  assert.deepEqual(await new HarmonyHarnessClient().run(), { status: "ok", level: "H4", tests: 18, patchedMethods: 0 });
});

test("stage 6 controlled adapter installs transactionally, launches active profile plugins, diagnoses, and uninstalls", { skip: process.platform !== "win32" }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-runtime-integration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = path.join(root, "state"); const game = path.join(root, "game");
  await cp(path.join(process.cwd(), "tests", "fixtures", "sample-unity-mono"), game, { recursive: true });
  await mkdir(data, { recursive: true }); await writeFile(path.join(data, "migration.json"), JSON.stringify({ completedAt: new Date().toISOString() }));
  const context = await createAppContext({ dataDir: data }); await context.initialize();
  const target = await context.targets.add({ name: "Controlled Unity Mono", rootDir: game, executable: "ModeDOCK.SampleUnityMonoGame.exe" });

  const before = await context.runtime.status(target);
  assert.equal(before.supported, true); assert.equal(before.installed, false); assert.equal(before.inspection?.knownProtectionStatus, "not-applicable");
  const dryRun = await context.runtime.install(target, { dryRun: true });
  assert.ok("totalBytes" in dryRun && dryRun.files.some(file => file.targetRelative.endsWith("0Harmony.dll")));
  await assert.rejects(() => readFile(path.join(game, ".moddock", "runtime", "ModeDOCK.Runtime.exe")), /ENOENT/, "dry-run must not write bootstrap files");
  const runtimeRecord = await context.runtime.install(target);
  assert.ok("installedAt" in runtimeRecord && runtimeRecord.files.every(file => !file.relative.toLowerCase().endsWith(".pdb")));
  const lock = JSON.parse(await readFile(path.join(game, ".moddock", "runtime-lock.json"), "utf8")) as { runtimeCompatibility: Record<string, string> };
  assert.deepEqual(lock.runtimeCompatibility, { bepInEx: "B2", harmony: "H2", native: "N1" });

  const pluginRecords = [];
  for (const name of ["ModeDOCK.RequiredBepInExPlugin.dll", "ModeDOCK.SyntheticBepInExPlugin.dll"]) {
    const source = path.join(process.cwd(), "tests", "fixtures", "managed", name);
    const plan = await context.installer.plan(source, target, { destination: "plugins", force: true });
    pluginRecords.push(await context.installer.install(plan));
  }
  const doctor = await context.runtime.doctor(target);
  assert.equal(doctor.some(check => check.status === "error"), false, JSON.stringify(doctor));
  const launched = await context.runtime.launch(target, target.id);
  assert.equal(launched.exitCode, 0, launched.stderr);
  const launchReport = JSON.parse(launched.stdout) as { status: string; plugins: Array<{ guid: string; state: string }> };
  assert.equal(launchReport.status, "ok");
  assert.deepEqual(launchReport.plugins.map(plugin => plugin.guid), ["com.modedock.required", "com.modedock.synthetic"]);
  assert.ok(await readFile(path.join(game, ".moddock", "config", "com.modedock.synthetic.cfg"), "utf8"));
  await context.installer.disable(target, pluginRecords[1]!);
  const profileFiltered = JSON.parse((await context.runtime.launch(target, target.id)).stdout) as { plugins: Array<{ guid: string }> };
  assert.deepEqual(profileFiltered.plugins.map(plugin => plugin.guid), ["com.modedock.required"], "disabled profile plugins must not be loaded");

  const removal = await context.runtime.uninstall(target, { dryRun: true });
  assert.ok(Array.isArray(removal) && removal.length > 0);
  await context.runtime.uninstall(target);
  assert.equal((await context.runtime.status(target)).installed, false);
  await assert.rejects(() => readFile(path.join(game, ".moddock", "runtime", "ModeDOCK.Runtime.exe")), /ENOENT/);
});

test("stage 6 runtime refuses an unknown installation instead of launching it", async t => {
  const setup = await fixture(); t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Unknown", rootDir: setup.targetRoot, executable: "game.exe" });
  const status = await setup.context.runtime.status(target);
  assert.equal(status.supported, false);
  await assert.rejects(() => setup.context.runtime.install(target), (error: unknown) => error instanceof Error && "code" in error && error.code === "GAME_RUNTIME_UNSUPPORTED");
});

test("target profiles are created, persisted, selected, and validated", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Example Game", rootDir: setup.targetRoot, executable: "game.exe" });
  assert.equal((await setup.context.targets.active()).id, target.id);
  assert.equal((await setup.context.targets.validate(target.id))[0]!.issues.length, 0);
  assert.equal((await setup.context.targets.list()).length, 1);
  const source = path.join(setup.root, "target-owned.dll");
  await writeFile(source, "payload");
  const record = await setup.context.installer.install(await setup.context.installer.plan(source, target), { force: true });
  await assert.rejects(
    () => setup.context.targets.remove(target.id),
    (error: unknown) => error instanceof ModeDockError
      && error.code === "TARGET_IN_USE"
      && error.message.includes(`moddock remove ${record.id} --target ${target.id} --force`)
      && error.message.includes(`moddock target remove ${target.id} --force`)
  );
});

test("installation folder analysis infers the game executable and BepInEx integration", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-analysis-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const gameRoot = path.join(root, "Deep Space");
  const data = path.join(root, "state");
  await mkdir(path.join(gameRoot, "BepInEx", "plugins"), { recursive: true });
  await mkdir(path.join(gameRoot, "BepInEx", "config"), { recursive: true });
  await writeFile(path.join(gameRoot, "DeepSpace.exe"), "game executable");
  await writeFile(path.join(gameRoot, "UnityCrashHandler64.exe"), "crash helper");
  await mkdir(data, { recursive: true });
  await writeFile(path.join(data, "migration.json"), JSON.stringify({ completedAt: new Date().toISOString() }));
  const context = await createAppContext({ dataDir: data });
  await context.initialize();

  const analyzed = await context.targets.analyze(gameRoot);
  assert.equal(analyzed.name, "Deep Space");
  assert.equal(analyzed.executable, "DeepSpace.exe");
  assert.equal(analyzed.loader, "BepInEx");
  assert.equal(analyzed.pluginsDir, "BepInEx/plugins");
  assert.equal(analyzed.configDir, "BepInEx/config");
});

test("default discovery does not scan arbitrary application directories", async () => {
  const detected = await new StandardTargetAdapter().detect({ roots: [], platform: process.platform });
  assert.deepEqual(detected, []);
});

test("path validation rejects traversal and escaped destinations", () => {
  assert.equal(normalizeRelative("Mods/plugin.dll"), "Mods/plugin.dll");
  assert.throws(() => normalizeRelative("../outside.dll"), /inside the selected target/);
  assert.throws(() => ensureInside("C:/safe", "C:/outside/file.dll"), /escaped the selected target/);
});

test("installation planning and dry-run do not modify target files", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Dry Run Game", rootDir: setup.targetRoot, executable: "game.exe" });
  const source = path.join(setup.root, "example.dll");
  await writeFile(source, "payload");
  const plan = await setup.context.installer.plan(source, target, { dryRun: true });
  assert.equal(plan.files[0]!.targetRelative, "Plugins/example.dll");
  const quotedPlan = await setup.context.installer.plan(`"${source}"`, target, { dryRun: true });
  assert.equal(quotedPlan.sourcePath, source);
  const moduleSource = path.join(setup.root, "moddock.mjs");
  await writeFile(moduleSource, "export default {};");
  target.supportedExtensions = [".js"];
  assert.equal((await setup.context.installer.plan(moduleSource, target, { dryRun: true })).files[0]!.targetRelative, "Mods/moddock.mjs");
  await assert.rejects(() => setup.context.installer.install(plan, { dryRun: true }), /dry-run plan/);
  await assert.rejects(() => readFile(path.join(setup.targetRoot, "Plugins", "example.dll")));
});

test("installations create snapshots and can disable, enable, and remove safely", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Managed Game", rootDir: setup.targetRoot, executable: "game.exe" });
  const source = path.join(setup.root, "managed.dll");
  await writeFile(source, "managed payload");
  let record = await setup.context.installer.install(await setup.context.installer.plan(source, target), { force: true });
  assert.equal(await readFile(path.join(setup.targetRoot, "Plugins", "managed.dll"), "utf8"), "managed payload");
  await assert.rejects(
    () => setup.context.installer.plan(source, target),
    (error: unknown) => error instanceof ModeDockError
      && error.code === "DUPLICATE_INSTALL"
      && error.message.includes(`moddock reinstall ${record.id}`)
      && (error.details as { installationId?: string })?.installationId === record.id
  );
  await writeFile(path.join(setup.targetRoot, "Plugins", "managed.dll"), "locally changed payload");
  await writeFile(source, "updated source payload");
  await assert.rejects(() => setup.context.installer.reinstall(target, record), (error: unknown) => error instanceof ModeDockError && error.code === "INTEGRITY_ERROR");
  record = await setup.context.installer.reinstall(target, record, { force: true });
  assert.equal(await readFile(path.join(setup.targetRoot, "Plugins", "managed.dll"), "utf8"), "updated source payload");
  const snapshot = await setup.context.backups.create(target, "Before changes");
  assert.equal(snapshot.files.length, 1);
  await setup.context.installer.disable(target, record);
  assert.equal(record.enabled, false);
  await setup.context.installer.enable(target, record);
  assert.equal(record.enabled, true);
  await setup.context.installer.remove(target, record);
  await assert.rejects(() => readFile(path.join(setup.targetRoot, "Plugins", "managed.dll")));
});

test("failed multi-file installation rolls back already written files", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Rollback Game", rootDir: setup.targetRoot, executable: "game.exe" });
  const source = path.join(setup.root, "package");
  await mkdir(source);
  await writeFile(path.join(source, "a.dll"), "a");
  await writeFile(path.join(source, "b.dll"), "b");
  const plan = await setup.context.installer.plan(source, target);
  plan.files[1]!.sourcePath = undefined;
  plan.files[1]!.content = undefined;
  await assert.rejects(() => setup.context.installer.install(plan, { force: true }), /source content is missing/);
  await assert.rejects(() => readFile(path.join(setup.targetRoot, "Plugins", "a.dll")));
  await assert.rejects(() => readFile(path.join(setup.targetRoot, "Plugins", "b.dll")));
});

test("configuration merges defaults and persists customization", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "config.json");
  await writeFile(file, JSON.stringify({ theme: "amber", createBackups: false }));
  const service = new ConfigService(file);
  const loaded = await service.load();
  assert.equal(loaded.language, "en");
  assert.equal(loaded.theme, "amber");
  assert.equal(loaded.createBackups, false);
  assert.equal(loaded.maxArchiveFiles, DEFAULT_CONFIG.maxArchiveFiles);
  await service.set("logoStyle", "compact");
  await service.set("language", "ru");
  const persisted = await readFile(file, "utf8");
  assert.match(persisted, /compact/);
  assert.match(persisted, /"language": "ru"/);
});

test("custom target adapters load independently from the core", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-adapter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "example.mjs");
  await writeFile(file, `export default { id: "example-test", name: "Example", async detect(){ return []; }, createProfile(input){ return input; }, async validate(){ return []; }, routeFile(){ return "mods"; } };`);
  const registry = new AdapterRegistry();
  const errors = await registry.loadCustom({ ...DEFAULT_CONFIG, customAdapters: [file] });
  assert.deepEqual(errors, []);
  assert.equal(registry.get("example-test").name, "Example");
});

test("ZIP expansion rejects path traversal entries", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Archive Game", rootDir: setup.targetRoot, executable: "game.exe" });
  const archive = path.join(setup.root, "unsafe.zip");
  await writeFile(archive, zipSync({ "../escape.dll": new TextEncoder().encode("bad") }));
  await assert.rejects(() => setup.context.installer.plan(archive, target), /inside the selected target/);
});

test("ModeDOCK application archives are rejected as game mods with one explicit error", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const target = await setup.context.targets.add({ name: "Archive Game", rootDir: setup.targetRoot, executable: "game.exe" });
  const archive = path.join(setup.root, "moddock-application.zip");
  await writeFile(archive, zipSync({
    "bin/moddock.mjs": new TextEncoder().encode("export default {};"),
    "include/moddock_plugin.h": new TextEncoder().encode("#pragma once")
  }));
  await assert.rejects(
    () => setup.context.installer.plan(archive, target),
    (error: unknown) => error instanceof ModeDockError && error.code === "APPLICATION_PACKAGE_NOT_MOD" && error.message.includes("not a game mod")
  );
});

test("loader-aware archive routing does not duplicate BepInEx directories", async t => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await mkdir(path.join(setup.targetRoot, "BepInEx", "plugins"), { recursive: true });
  await mkdir(path.join(setup.targetRoot, "BepInEx", "config"), { recursive: true });
  const analyzed = await setup.context.targets.analyze(setup.targetRoot, "game.exe", "Loader Game");
  const target = await setup.context.targets.add(analyzed);
  const archive = path.join(setup.root, "loader-mod.zip");
  await writeFile(archive, zipSync({ "BepInEx/plugins/Example.dll": new TextEncoder().encode("plugin") }));

  const plan = await setup.context.installer.plan(archive, target);
  assert.equal(plan.files[0]!.targetRelative, "BepInEx/plugins/Example.dll");
});
