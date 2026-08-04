import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sandbox = mkdtempSync(path.join(tmpdir(), "moddock-global-test-"));
const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageMetadata = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const npmEntrypoint = process.env.npm_execpath;
if (!npmEntrypoint) throw new Error("npm_execpath is unavailable; run through npm run test:install.");

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.stdout.trim();
}

try {
  const packed = JSON.parse(execute(process.execPath, [npmEntrypoint, "pack", "--json", "--ignore-scripts", "--pack-destination", sandbox], { cwd: packageRoot }))[0];
  const names = new Set(packed.files.map(file => file.path.replaceAll("\\", "/")));
  for (const required of ["dist/moddock.js", "README.md", "COMMANDS.md", "CHANGELOG.md", "SECURITY.md", "package.json", "native/include/modedock_plugin.h", "native/bin/moddock-native-probe.exe", "managed/bin/managed-inspector/ModeDOCK.ManagedInspector.exe", "managed/bin/runtime/ModeDOCK.Runtime.exe", "managed/bin/runtime/0Harmony.dll", "docs/NATIVE_ABI.md", "docs/GAME_ADAPTERS.md", "docs/ARCHITECTURE.md", "docs/ADAPTERS.md", "docs/PUBLISHING.md", "docs/RELEASE_1.0.0b.md"])
    if (!names.has(required)) throw new Error(`Packed tarball is missing ${required}.`);
  const unexpected = [...names].filter(name => name.startsWith("src/") || name.startsWith("tests/") || name.startsWith("node_modules/") || name.endsWith(".map"));
  if (unexpected.length) throw new Error(`Development files leaked into tarball: ${unexpected.join(", ")}`);
  if (packed.unpackedSize > 1_048_576) throw new Error(`Unpacked package exceeds 1 MiB: ${packed.unpackedSize} bytes.`);

  const tarball = path.join(sandbox, packed.filename);
  const prefix = path.join(sandbox, "prefix");
  execute(process.execPath, [npmEntrypoint, "install", "--global", tarball, "--prefix", prefix, "--ignore-scripts"]);
  const command = process.platform === "win32" ? path.join(prefix, "moddock.cmd") : path.join(prefix, "bin", "moddock");
  const runInstalled = args => process.platform === "win32"
    ? execute(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", command, ...args], { cwd: sandbox })
    : execute(command, args, { cwd: sandbox });

  if (runInstalled(["--version"]) !== (packageMetadata.displayVersion ?? packageMetadata.version)) throw new Error("Installed command returned the wrong version.");
  const help = runInstalled(["--help"]);
  if (!help.includes("target add") || !help.includes("install <path>") || !help.includes("backup create") || !help.includes("runtime status")) throw new Error("Installed command help is incomplete.");
  const dataDir = path.join(sandbox, "state");
  const initialized = runInstalled(["init", "--data-dir", dataDir, "--json"]);
  if (!JSON.parse(initialized).dataDir) throw new Error("Installed command could not initialize isolated state.");
  const fixture = path.join(packageRoot, "tests", "fixtures", "ModeDOCK_DeadCells_Test(1).dll");
  const inspected = JSON.parse(runInstalled(["dll", "inspect", fixture, "--data-dir", dataDir, "--json"]));
  if (inspected.detectedRuntime !== "modedock-native-abi-v1" || inspected.sha256 !== "afa645eb193116ca426ef9e86a1b9426e87d59da02e39b6269f4cb8a53c4a8bb")
    throw new Error("Installed command did not inspect the N1 fixture correctly.");
  if (process.platform === "win32") {
    const probed = JSON.parse(runInstalled(["dll", "probe", fixture, "--execute-probe", "--force", "--data-dir", dataDir, "--json"]));
    if (probed.status !== "ok" || probed.apiVersion !== 1 || probed.ping !== 1)
      throw new Error("Installed command did not execute the isolated N1 probe correctly.");
    const managedFixture = path.join(packageRoot, "tests", "fixtures", "managed", "ModeDOCK.SyntheticBepInExPlugin.dll");
    const managed = JSON.parse(runInstalled(["plugin", "inspect", managedFixture, "--data-dir", dataDir, "--json"]));
    if (managed.classification !== "bepinex5-unity-mono" || managed.plugins[0]?.guid !== "com.modedock.synthetic")
      throw new Error("Installed command did not inspect the synthetic managed plugin correctly.");
  }
  const targetRoot = path.join(sandbox, "example-target");
  const source = path.join(sandbox, "example.dll");
  mkdirSync(targetRoot, { recursive: true });
  writeFileSync(path.join(targetRoot, "Example.exe"), "test executable");
  writeFileSync(source, "plugin payload");
  const target = JSON.parse(runInstalled(["target", "add", "--name", "Example", "--root", targetRoot, "--exe", "Example.exe", "--data-dir", dataDir, "--json"]));
  if (target.name !== "Example") throw new Error("Target creation failed through installed command.");
  const runtimeStatus = JSON.parse(runInstalled(["runtime", "status", target.id, "--data-dir", dataDir, "--json"]));
  if (runtimeStatus.supported !== false || runtimeStatus.installed !== false) throw new Error("Unknown runtime target did not fail closed.");
  const dryRun = JSON.parse(runInstalled(["install", source, "--dry-run", "--data-dir", dataDir, "--json"]));
  if (dryRun.files.length !== 1 || existsSync(path.join(targetRoot, "Plugins", "example.dll"))) throw new Error("Dry-run modified files or returned an invalid plan.");
  const installed = JSON.parse(runInstalled(["install", source, "--data-dir", dataDir, "--json"]));
  if (!existsSync(path.join(targetRoot, "Plugins", "example.dll"))) throw new Error("Installed package did not copy its payload.");
  runInstalled(["disable", installed.id, "--data-dir", dataDir, "--json"]);
  runInstalled(["enable", installed.id, "--data-dir", dataDir, "--json"]);
  runInstalled(["backup", "create", "--name", "Test snapshot", "--data-dir", dataDir, "--json"]);
  runInstalled(["remove", installed.id, "--force", "--data-dir", dataDir, "--json"]);
  if (existsSync(path.join(targetRoot, "Plugins", "example.dll"))) throw new Error("Removal left the managed payload behind.");
  runInstalled(["doctor", "--data-dir", dataDir, "--json"]);
  console.log(`PASS: ${packed.filename} (${packed.size} B packed, ${packed.unpackedSize} B unpacked) installs globally and exposes moddock`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
