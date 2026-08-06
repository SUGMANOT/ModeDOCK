import { ModeDockCoreError } from "../errors.js";

export class Args {
  readonly positionals: string[] = [];
  readonly options = new Map<string, string[]>();

  static parse(argv: string[]): Args {
    const result = new Args();
    for (let index = 0; index < argv.length; index++) {
      const token = argv[index]!;
      if (!token.startsWith("--")) { result.positionals.push(token); continue; }
      const equal = token.indexOf("=");
      const key = token.slice(2, equal === -1 ? undefined : equal);
      if (!key) throw new ModeDockCoreError(`Invalid option: ${token}`, "USAGE_ERROR");
      const value = equal === -1 ? argv[index + 1] : token.slice(equal + 1);
      if (isBooleanOption(key)) {
        result.push(key, equal === -1 ? "true" : value ?? "true");
        continue;
      }
      if (value === undefined || (equal === -1 && value.startsWith("--"))) {
        throw new ModeDockCoreError(`Option --${key} requires a value.`, "USAGE_ERROR");
      }
      result.push(key, value);
      if (equal === -1) index++;
    }
    return result;
  }

  get(key: string): string | undefined { return this.options.get(key)?.at(-1); }
  all(key: string): string[] { return [...(this.options.get(key) ?? [])]; }
  has(key: string): boolean { return this.get(key) === "true"; }
  required(key: string): string {
    const value = this.get(key);
    if (!value) throw new ModeDockCoreError(`Missing required option --${key}.`, "USAGE_ERROR");
    return value;
  }

  private push(key: string, value: string): void {
    const values = this.options.get(key) ?? [];
    values.push(value);
    this.options.set(key, values);
  }
}

function isBooleanOption(key: string): boolean {
  return new Set(["json", "dry-run", "help"]).has(key);
}
