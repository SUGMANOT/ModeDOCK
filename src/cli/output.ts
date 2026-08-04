export class CliOutput {
  constructor(private readonly json = false, private readonly quiet = false) {}

  value(value: unknown, text?: string): void {
    if (this.quiet) return;
    if (this.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    else if (text !== undefined) process.stdout.write(`${text}\n`);
    else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  table(headers: string[], rows: string[][]): void {
    if (this.quiet) return;
    if (this.json) { this.value(rows.map(row => Object.fromEntries(headers.map((header, index) => [toCamel(header), row[index] ?? ""])))); return; }
    if (!rows.length) { process.stdout.write("No entries.\n"); return; }
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index]?.length ?? 0)));
    const line = (row: string[]) => widths.map((width, index) => (row[index] ?? "").padEnd(width)).join("  ");
    process.stdout.write(`${line(headers)}\n${widths.map(width => "-".repeat(width)).join("  ")}\n`);
    rows.forEach(row => process.stdout.write(`${line(row)}\n`));
  }

  error(error: Error & { code?: string; details?: unknown }): void {
    if (this.json) process.stderr.write(`${JSON.stringify({ error: { code: error.code ?? "UNEXPECTED_ERROR", message: error.message, details: error.details } }, null, 2)}\n`);
    else process.stderr.write(`moddock: ${error.message}\n`);
  }
}

function toCamel(value: string): string {
  return value.toLowerCase().replace(/[-_ ]+(.)/g, (_, character: string) => character.toUpperCase());
}
