#!/usr/bin/env node
import { run } from "./cli/main.js";
import { ModeDockCoreError } from "./errors.js";

try {
  process.exitCode = await run();
} catch (error) {
  const code = error instanceof ModeDockCoreError ? error.code : "UNEXPECTED_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message, details: error instanceof ModeDockCoreError ? error.details : undefined } })}\n`);
  else process.stderr.write(`ModeDOCK Core error [${code}]: ${message}\n`);
  process.exitCode = 1;
}
