import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const testDirectory = path.resolve("dist-test", "test");
const entries = await readdir(testDirectory, { withFileTypes: true });
const testFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
  .map((entry) => path.join(testDirectory, entry.name))
  .sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  throw new Error(`No compiled test files found in ${testDirectory}`);
}

const coverage = process.argv.includes("--coverage");
const args = [
  ...(coverage ? ["--experimental-test-coverage"] : []),
  "--test",
  ...testFiles
];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  windowsHide: true
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
