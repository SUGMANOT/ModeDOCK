import { createAppContext } from "../core/app-context.js";
import { UsageError } from "../core/errors.js";
import { VERSION } from "../core/version.js";
import { ParsedArgs } from "./args.js";
import { runDirect } from "./cli-app.js";
import { printHelp } from "./help.js";
import { CliOutput } from "./output.js";
import { InteractiveApp } from "./ui/interactive-app.js";

async function main(): Promise<void> {
  let args: ParsedArgs;
  try { args = ParsedArgs.parse(process.argv.slice(2)); }
  catch (error) { new CliOutput(process.argv.includes("--json")).error(error as Error); process.exitCode = 2; return; }

  if (args.has("version")) { process.stdout.write(`${VERSION}\n`); return; }
  if (args.has("help")) { printHelp(args.positionals[0]); return; }
  if (args.positionals[0] === "help") { printHelp(args.positionals[1]); return; }

  try {
    const context = await createAppContext({ configPath: args.get("config"), dataDir: args.get("data-dir"), verbose: args.has("verbose") });
    await context.initialize();
    if (!args.positionals.length) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) { printHelp(); return; }
      await new InteractiveApp(context).run();
      process.stdin.pause();
      return;
    }
    await runDirect(context, args);
  } catch (error) {
    new CliOutput(args.has("json")).error(error as Error);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

void main();
