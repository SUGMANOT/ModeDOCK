import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = await mkdtemp(path.join(os.tmpdir(), "moddock-tui-test-"));
const entrypoint = pathToFileURL(path.join(root, "dist", "moddock.js")).href;
const wrapper = `
Object.defineProperty(process.stdin, "isTTY", { value: true });
Object.defineProperty(process.stdout, "isTTY", { value: true });
Object.defineProperty(process.stdout, "columns", { value: 80 });
process.stdin.setRawMode = () => process.stdin;
process.argv = [process.execPath, ${JSON.stringify(path.join(root, "dist", "moddock.js"))}];
await import(${JSON.stringify(entrypoint)});
`;

const child = spawn(process.execPath, ["--input-type=module", "--eval", wrapper], {
  cwd: root,
  env: { ...process.env, MODDOCK_DATA_DIR: dataDir, MODDOCK_ASCII: "1", NO_COLOR: "1" },
  stdio: ["pipe", "pipe", "pipe"]
});

let output = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });

const down = count => child.stdin.write("\x1b[B".repeat(count));
const right = () => child.stdin.write("\x1b[C");
const enter = () => child.stdin.write("\r");
const escape = () => child.stdin.write("\x1b");

async function waitFor(text, timeoutMs = 5_000) {
  const started = Date.now();
  while (!output.includes(text)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${JSON.stringify(text)}.\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function waitForExit(timeoutMs = 5_000) {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", code => resolve(code ?? 1));
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Interactive process did not exit.\n${output}`)), timeoutMs))
  ]);
}

try {
  await waitFor("Main menu");
  down(5);
  enter();
  await waitFor("Changes are saved and applied instantly");

  right();
  await waitFor("Изменения сохраняются и применяются сразу");
  down(1);
  right();
  await waitFor("Монохромная");

  escape();
  await waitFor("Главное меню");
  down(7);
  enter();
  child.stdin.end();

  const exitCode = await waitForExit();
  if (exitCode !== 0) throw new Error(`Interactive process exited with code ${exitCode}.\n${output}`);
  if (!output.includes("\x1b[2J\x1b[H"))
    throw new Error("Interactive frames do not clear the screen before redrawing.");
  const config = JSON.parse(await readFile(path.join(dataDir, "config.json"), "utf8"));
  if (config.language !== "ru" || config.theme !== "mono")
    throw new Error(`Live settings were not persisted: ${JSON.stringify(config)}`);
  console.log("PASS: live settings update in place and Exit releases the terminal process");
} finally {
  if (child.exitCode === null) child.kill();
  await rm(dataDir, { recursive: true, force: true });
}
