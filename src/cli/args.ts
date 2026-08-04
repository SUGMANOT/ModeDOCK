import { UsageError } from "../core/errors.js";

const booleanOptions = new Set(["help", "version", "json", "quiet", "verbose", "force", "dry-run", "no-backup", "all", "execute-probe"]);
const aliases: Record<string, string> = { h: "help", v: "version", q: "quiet", t: "target", f: "force" };

export class ParsedArgs {
  readonly positionals: string[] = [];
  readonly options = new Map<string, string | boolean>();

  static parse(argv: string[]): ParsedArgs {
    const result = new ParsedArgs();
    let positionalOnly = false;
    for (let index = 0; index < argv.length; index++) {
      const token = argv[index]!;
      if (positionalOnly || token === "-" || !token.startsWith("-")) { result.positionals.push(token); continue; }
      if (token === "--") { positionalOnly = true; continue; }
      let key: string;
      let value: string | boolean | undefined;
      if (token.startsWith("--")) {
        const option = token.slice(2);
        const split = option.indexOf("=");
        key = split >= 0 ? option.slice(0, split) : option;
        if (split >= 0) value = option.slice(split + 1);
      } else {
        key = aliases[token.slice(1)] ?? "";
        if (!key) throw new UsageError(`Unknown option: ${token}`);
      }
      if (!key) throw new UsageError("Option name cannot be empty.");
      if (result.options.has(key)) throw new UsageError(`Option --${key} was supplied more than once.`);
      if (booleanOptions.has(key)) {
        if (value !== undefined) throw new UsageError(`Option --${key} does not take a value.`);
        value = true;
      } else if (value === undefined) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("-")) throw new UsageError(`Option --${key} requires a value.`);
        value = next; index++;
      }
      result.options.set(key, value);
    }
    return result;
  }

  has(key: string): boolean { return this.options.has(key); }
  get(key: string): string | undefined { const value = this.options.get(key); return typeof value === "string" ? value : undefined; }
  require(key: string): string { const value = this.get(key); if (!value) throw new UsageError(`Missing required option --${key}.`); return value; }

  ensureOnly(...allowedForCommand: string[]): void {
    const global = new Set(["help", "version", "json", "quiet", "verbose", "config", "data-dir", "target", "force", "dry-run", "no-backup"]);
    for (const key of this.options.keys()) if (!global.has(key) && !allowedForCommand.includes(key))
      throw new UsageError(`Option --${key} is not valid for this command.`);
  }
}
