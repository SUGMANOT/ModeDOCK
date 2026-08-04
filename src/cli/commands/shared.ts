import type { AppContext } from "../../core/app-context.js";
import { ConfirmationRequiredError, UsageError } from "../../core/errors.js";
import type { TargetProfile } from "../../types/index.js";
import { ParsedArgs } from "../args.js";
import { TerminalUI } from "../ui/terminal.js";

export interface CommandEnvironment {
  context: AppContext;
  args: ParsedArgs;
  ui: TerminalUI;
  json: boolean;
  quiet: boolean;
}

export async function activeTarget(environment: CommandEnvironment): Promise<TargetProfile> {
  return environment.context.targets.active(environment.args.get("target"));
}

export async function confirmOrThrow(environment: CommandEnvironment, message: string): Promise<void> {
  if (environment.args.has("force")) return;
  if (await environment.ui.confirm(message)) return;
  throw new ConfirmationRequiredError(`${message} Re-run with --force in non-interactive use.`);
}

export function requiredPosition(positionals: string[], index: number, label: string): string {
  const value = positionals[index];
  if (!value) throw new UsageError(`Missing ${label}.`);
  return value;
}

export function commaList(value?: string): string[] | undefined {
  return value?.split(",").map(item => item.trim()).filter(Boolean);
}

export function shortId(id: string): string { return id.slice(0, 8); }
