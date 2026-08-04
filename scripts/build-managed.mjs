import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = path.join(root, "managed", "ModeDOCK.ManagedInspector", "ModeDOCK.ManagedInspector.csproj");
const output = path.join(root, "managed", "bin", "managed-inspector");
const fixtureProject = path.join(root, "managed", "ModeDOCK.TestFixtures", "SyntheticPlugin", "SyntheticPlugin.csproj");
const throwingFixtureProject = path.join(root, "managed", "ModeDOCK.TestFixtures", "ThrowingPlugin", "ThrowingPlugin.csproj");
const requiredFixtureProject = path.join(root, "managed", "ModeDOCK.TestFixtures", "RequiredPlugin", "RequiredPlugin.csproj");
const harmonyUnsupportedFixtureProject = path.join(root, "managed", "ModeDOCK.TestFixtures", "HarmonyUnsupportedPlugin", "HarmonyUnsupportedPlugin.csproj");
const fixtureOutput = path.join(root, "tests", "fixtures", "managed");
const runtimeProject = path.join(root, "managed", "ModeDOCK.Runtime", "ModeDOCK.Runtime.csproj");
const runtimeOutput = path.join(root, "managed", "bin", "runtime");
const harmonyHarnessProject = path.join(root, "managed", "ModeDOCK.HarmonyHarness", "ModeDOCK.HarmonyHarness.csproj");
const harmonyHarnessOutput = path.join(root, "managed", "bin", "harmony-harness");
const sampleGameProject = path.join(root, "managed", "ModeDOCK.SampleUnityMonoGame", "ModeDOCK.SampleUnityMonoGame.csproj");
const assemblyCSharpProject = path.join(root, "managed", "ModeDOCK.TestFixtures", "AssemblyCSharp", "AssemblyCSharp.csproj");
const sampleGameOutput = path.join(root, "tests", "fixtures", "sample-unity-mono");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = spawnSync("dotnet", ["publish", project, "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "false", "--output", output, "--nologo"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error || result.status !== 0) throw new Error(result.error?.message ?? `dotnet publish failed with exit code ${result.status}`);
await rm(runtimeOutput, { recursive: true, force: true });
await mkdir(runtimeOutput, { recursive: true });
const runtimeResult = spawnSync("dotnet", ["publish", runtimeProject, "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "false", "--output", runtimeOutput, "--nologo"], {
  cwd: root, encoding: "utf8", stdio: "pipe", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(runtimeResult.stdout || ""); process.stderr.write(runtimeResult.stderr || "");
if (runtimeResult.error || runtimeResult.status !== 0) throw new Error(runtimeResult.error?.message ?? `runtime publish failed with exit code ${runtimeResult.status}`);
for (const name of await readdir(runtimeOutput)) if (name.toLowerCase().endsWith(".pdb")) await rm(path.join(runtimeOutput, name), { force: true });
await rm(harmonyHarnessOutput, { recursive: true, force: true });
await mkdir(harmonyHarnessOutput, { recursive: true });
const harmonyHarnessResult = spawnSync("dotnet", ["publish", harmonyHarnessProject, "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "false", "--output", harmonyHarnessOutput, "--nologo"], {
  cwd: root, encoding: "utf8", stdio: "pipe", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(harmonyHarnessResult.stdout || ""); process.stderr.write(harmonyHarnessResult.stderr || "");
if (harmonyHarnessResult.error || harmonyHarnessResult.status !== 0) throw new Error(harmonyHarnessResult.error?.message ?? `Harmony harness publish failed with exit code ${harmonyHarnessResult.status}`);
for (const name of await readdir(harmonyHarnessOutput)) if (name.toLowerCase().endsWith(".pdb")) await rm(path.join(harmonyHarnessOutput, name), { force: true });
await rm(sampleGameOutput, { recursive: true, force: true });
await mkdir(sampleGameOutput, { recursive: true });
const sampleGameResult = spawnSync("dotnet", ["publish", sampleGameProject, "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "false", "--output", sampleGameOutput, "--nologo"], {
  cwd: root, encoding: "utf8", stdio: "pipe", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(sampleGameResult.stdout || ""); process.stderr.write(sampleGameResult.stderr || "");
if (sampleGameResult.error || sampleGameResult.status !== 0) throw new Error(sampleGameResult.error?.message ?? `sample game publish failed with exit code ${sampleGameResult.status}`);
const sampleManagedOutput = path.join(sampleGameOutput, "ModeDOCK.SampleUnityMonoGame_Data", "Managed");
await mkdir(sampleManagedOutput, { recursive: true });
const assemblyCSharpResult = spawnSync("dotnet", ["build", assemblyCSharpProject, "--configuration", "Release", "--output", sampleManagedOutput, "--nologo"], {
  cwd: root, encoding: "utf8", stdio: "pipe", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(assemblyCSharpResult.stdout || ""); process.stderr.write(assemblyCSharpResult.stderr || "");
if (assemblyCSharpResult.error || assemblyCSharpResult.status !== 0) throw new Error(assemblyCSharpResult.error?.message ?? `Assembly-CSharp fixture build failed with exit code ${assemblyCSharpResult.status}`);
const sampleExe = "ModeDOCK.SampleUnityMonoGame.exe";
const sampleHash = createHash("sha256").update(await readFile(path.join(sampleGameOutput, sampleExe))).digest("hex");
await writeFile(path.join(sampleGameOutput, "moddock-fixture.json"), JSON.stringify({ schemaVersion: 1, fixtureId: "modedock.controlled-unity-mono.v1", gameVersion: "1.0.0-test", unityVersion: "controlled-2026.1", executable: sampleExe, executableSha256: sampleHash }, null, 2) + "\n");
await rm(fixtureOutput, { recursive: true, force: true });
await mkdir(fixtureOutput, { recursive: true });
const fixtureResult = spawnSync("dotnet", ["build", fixtureProject, "--configuration", "Release", "--output", fixtureOutput, "--nologo"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(fixtureResult.stdout || "");
process.stderr.write(fixtureResult.stderr || "");
if (fixtureResult.error || fixtureResult.status !== 0) throw new Error(fixtureResult.error?.message ?? `fixture build failed with exit code ${fixtureResult.status}`);
const throwingFixtureResult = spawnSync("dotnet", ["build", throwingFixtureProject, "--configuration", "Release", "--output", fixtureOutput, "--nologo"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(throwingFixtureResult.stdout || "");
process.stderr.write(throwingFixtureResult.stderr || "");
if (throwingFixtureResult.error || throwingFixtureResult.status !== 0) throw new Error(throwingFixtureResult.error?.message ?? `throwing fixture build failed with exit code ${throwingFixtureResult.status}`);
const requiredFixtureResult = spawnSync("dotnet", ["build", requiredFixtureProject, "--configuration", "Release", "--output", fixtureOutput, "--nologo"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(requiredFixtureResult.stdout || "");
process.stderr.write(requiredFixtureResult.stderr || "");
if (requiredFixtureResult.error || requiredFixtureResult.status !== 0) throw new Error(requiredFixtureResult.error?.message ?? `required fixture build failed with exit code ${requiredFixtureResult.status}`);
const harmonyUnsupportedFixtureResult = spawnSync("dotnet", ["build", harmonyUnsupportedFixtureProject, "--configuration", "Release", "--output", fixtureOutput, "--nologo"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
process.stdout.write(harmonyUnsupportedFixtureResult.stdout || "");
process.stderr.write(harmonyUnsupportedFixtureResult.stderr || "");
if (harmonyUnsupportedFixtureResult.error || harmonyUnsupportedFixtureResult.status !== 0) throw new Error(harmonyUnsupportedFixtureResult.error?.message ?? `unsupported Harmony fixture build failed with exit code ${harmonyUnsupportedFixtureResult.status}`);
console.log(`Built ${path.relative(root, output)}`);
