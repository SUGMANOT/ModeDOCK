import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, ".test-dist", "core.test.mjs");

await rm(path.dirname(output), { recursive: true, force: true });
try {
  await build({
    entryPoints: [path.join(root, "tests", "core.test.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    sourcemap: false,
    logLevel: "silent"
  });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", output], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
  if (exitCode) process.exitCode = exitCode;
} finally {
  await rm(path.dirname(output), { recursive: true, force: true });
}
