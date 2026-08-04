import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Native probe build skipped: the current stage ships a Windows x64 helper.");
  process.exit(0);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pinnedZig = {
  url: "https://ziglang.org/download/0.16.0/zig-x86_64-windows-0.16.0.zip",
  sha256: "68659eb5f1e4eb1437a722f1dd889c5a322c9954607f5edcf337bc3684a75a7e"
};
const source = path.join(root, "native", "modedock-native-probe", "main.c");
const outputDirectory = path.join(root, "native", "bin");
const output = path.join(outputDirectory, "moddock-native-probe.exe");
const stalePdb = path.join(outputDirectory, "moddock-native-probe.pdb");
const cacheRoot = path.join(root, ".tooling", "zig-cache");
await mkdir(outputDirectory, { recursive: true });
await rm(stalePdb, { force: true });
const resolved = await resolveZig();
try {
  const result = spawnSync(resolved.executable, [
    "cc",
    "-target", "x86_64-windows-gnu",
    "-O2",
    "-Wno-macro-redefined",
    source,
    "-o", output,
    "-s",
    "-Wl,--build-id=none",
    "-lshell32",
    "-lkernel32"
  ], {
    cwd: root,
    env: { ...process.env, ZIG_GLOBAL_CACHE_DIR: path.join(cacheRoot, "global"), ZIG_LOCAL_CACHE_DIR: path.join(cacheRoot, "local") },
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(result.error?.message ?? `zig cc failed with exit code ${result.status}`);
  }
  console.log(`Built ${path.relative(root, output)} with Zig ${resolved.version}`);
} finally {
  await rm(cacheRoot, { recursive: true, force: true });
  if (resolved.temporaryRoot && process.env.MODDOCK_KEEP_BUILD_TOOLS !== "1") await rm(resolved.temporaryRoot, { recursive: true, force: true });
}

async function resolveZig() {
  const configured = process.env.ZIG_EXE || "zig.exe";
  const version = spawnSync(configured, ["version"], { encoding: "utf8", windowsHide: true });
  if (!version.error && version.status === 0) return { executable: configured, version: version.stdout.trim() || "external" };
  if (process.env.ZIG_EXE) throw new Error(`Configured ZIG_EXE could not run: ${version.error?.message ?? version.stderr}`);

  const temporaryRoot = path.join(root, ".tooling", "zig-0.16.0-temporary");
  const archive = path.join(temporaryRoot, "zig.zip");
  const extracted = path.join(temporaryRoot, "extracted");
  await rm(temporaryRoot, { recursive: true, force: true }); await mkdir(temporaryRoot, { recursive: true });
  console.log("Zig was not found; downloading pinned Zig 0.16.0 from ziglang.org...");
  const response = await fetch(pinnedZig.url);
  if (!response.ok || !response.body) throw new Error(`Zig download failed with HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body), await import("node:fs").then(module => module.createWriteStream(archive)));
  const hash = await sha256(archive);
  if (hash !== pinnedZig.sha256) throw new Error(`Zig archive SHA-256 mismatch: ${hash}.`);
  await mkdir(extracted, { recursive: true });
  const expanded = spawnSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", archive, "-C", extracted], { encoding: "utf8", windowsHide: true });
  if (expanded.error || expanded.status !== 0) throw new Error(expanded.error?.message ?? `tar extraction failed: ${expanded.stderr}`);
  const executable = path.join(extracted, "zig-x86_64-windows-0.16.0", "zig.exe");
  return { executable, version: "0.16.0 (pinned temporary toolchain)", temporaryRoot };
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
