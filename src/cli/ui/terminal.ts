import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { LanguageName, LogoStyle, ThemeName } from "../../types/index.js";
import { UsageError } from "../../core/errors.js";
import { logo } from "./logo.js";
import { message } from "./messages.js";

const themes: Record<ThemeName, { accent: string; selected: string; muted: string; error: string; reset: string }> = {
  default: { accent: "\x1b[96m", selected: "\x1b[97;46m", muted: "\x1b[90m", error: "\x1b[91m", reset: "\x1b[0m" },
  mono: { accent: "\x1b[97m", selected: "\x1b[30;47m", muted: "\x1b[90m", error: "\x1b[97m", reset: "\x1b[0m" },
  amber: { accent: "\x1b[93m", selected: "\x1b[30;43m", muted: "\x1b[90m", error: "\x1b[91m", reset: "\x1b[0m" }
};

export type LiveMenuAction = "previous" | "next" | "activate";

export class TerminalUI {
  readonly interactive = Boolean(input.isTTY && output.isTTY);
  private readonly color: boolean;
  private theme: ThemeName;
  private logoStyle: LogoStyle;
  private language: LanguageName;

  constructor(theme: ThemeName = "default", logoStyle: LogoStyle = "full", language: LanguageName = "en") {
    this.theme = theme;
    this.logoStyle = logoStyle;
    this.language = language;
    this.color = this.interactive && !process.env.NO_COLOR;
  }

  configure(theme: ThemeName, logoStyle: LogoStyle, language: LanguageName): void {
    this.theme = theme;
    this.logoStyle = logoStyle;
    this.language = language;
  }

  clear(): void { if (this.interactive) output.write("\x1b[2J\x1b[H"); }
  paint(kind: keyof typeof themes.default, text: string): string { return this.color ? `${themes[this.theme][kind]}${text}${themes[this.theme].reset}` : text; }

  header(subtitle?: string): void {
    const lines = [this.paint("accent", logo(this.logoStyle)), message(this.language, "tagline")];
    if (subtitle) lines.push(this.paint("muted", subtitle));
    output.write(`${lines.join("\n")}\n\n`);
  }

  async select(title: string, items: string[], options: { subtitle?: string; initial?: number } = {}): Promise<number | null> {
    if (!this.interactive) throw new UsageError(message(this.language, "ttyRequired"));
    if (!items.length) return null;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write("\x1b[?25l");
    let selected = Math.max(0, Math.min(options.initial ?? 0, items.length - 1));
    const render = () => this.renderMenu(title, items, selected, options.subtitle, message(this.language, "navHint"));
    render();
    return new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        input.off("keypress", onKey);
        input.setRawMode(false);
        input.pause();
        output.write("\x1b[?25h\n");
      };
      const finish = (value: number | null) => { cleanup(); resolve(value); };
      const onKey = (_text: string, key: readline.Key) => {
        if (key.ctrl && key.name === "c") { output.write("\n"); process.exitCode = 130; finish(null); return; }
        if (key.name === "escape") { finish(null); return; }
        if (key.name === "up") { selected = (selected - 1 + items.length) % items.length; render(); }
        if (key.name === "down") { selected = (selected + 1) % items.length; render(); }
        if (key.name === "return" || key.name === "enter") finish(selected);
      };
      input.on("keypress", onKey);
    });
  }

  async liveMenu(
    title: () => string,
    items: () => string[],
    onAction: (index: number, action: LiveMenuAction) => Promise<boolean>,
    options: { subtitle?: () => string; initial?: number } = {}
  ): Promise<number | null> {
    if (!this.interactive) throw new UsageError(message(this.language, "ttyRequired"));
    const firstItems = items();
    if (!firstItems.length) return null;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write("\x1b[?25l");
    let selected = Math.max(0, Math.min(options.initial ?? 0, firstItems.length - 1));
    let busy = false;
    const render = () => {
      const currentItems = items();
      selected = Math.max(0, Math.min(selected, currentItems.length - 1));
      this.renderMenu(title(), currentItems, selected, options.subtitle?.(), message(this.language, "settingsHint"));
    };
    render();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        input.off("keypress", onKey);
        input.setRawMode(false);
        input.pause();
        output.write("\x1b[?25h\n");
      };
      const finish = (value: number | null) => { cleanup(); resolve(value); };
      const onKey = async (_text: string, key: readline.Key) => {
        if (busy) return;
        if (key.ctrl && key.name === "c") { output.write("\n"); process.exitCode = 130; finish(null); return; }
        if (key.name === "escape") { finish(null); return; }
        const currentItems = items();
        if (key.name === "up") { selected = (selected - 1 + currentItems.length) % currentItems.length; render(); return; }
        if (key.name === "down") { selected = (selected + 1) % currentItems.length; render(); return; }
        const action: LiveMenuAction | undefined = key.name === "left" ? "previous"
          : key.name === "right" ? "next"
          : key.name === "return" || key.name === "enter" ? "activate"
          : undefined;
        if (!action) return;
        busy = true;
        try {
          const stayOpen = await onAction(selected, action);
          if (!stayOpen) { finish(selected); return; }
          busy = false;
          render();
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      input.on("keypress", onKey);
    });
  }

  async prompt(label: string, defaultValue?: string): Promise<string> {
    const rl = createInterface({ input, output });
    try {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      const answer = (await rl.question(`${label}${suffix}: `)).trim();
      return answer || defaultValue || "";
    } finally { rl.close(); }
  }

  async confirm(text: string, defaultValue = false): Promise<boolean> {
    if (!this.interactive) return false;
    const answer = (await this.prompt(`${text} ${defaultValue ? "[Y/n]" : "[y/N]"}`)).toLowerCase();
    return answer ? ["y", "yes", "д", "да"].includes(answer) : defaultValue;
  }

  async pause(text = message(this.language, "pause")): Promise<void> { if (this.interactive) await this.prompt(text); }

  async spinner<T>(text: string, operation: () => Promise<T>): Promise<T> {
    if (!this.interactive) return operation();
    const frames = supportsUnicode() ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] : ["|", "/", "-", "\\"];
    let index = 0;
    output.write("\x1b[?25l");
    output.write(`${frames[0]} ${text}`);
    const timer = setInterval(() => output.write(`\r${frames[index++ % frames.length]} ${text}`), 80);
    try { return await operation(); }
    finally { clearInterval(timer); output.write("\r\x1b[2K\x1b[?25h"); }
  }

  status(text: string): void { output.write(`${text}\n`); }
  error(text: string): void { output.write(`${this.paint("error", `${message(this.language, "errorPrefix")}: ${text}`)}\n`); }

  private renderMenu(title: string, items: string[], selected: number, subtitle: string | undefined, hint: string): void {
    const width = Math.max(40, Math.min(output.columns ?? 80, 88));
    const lines = [
      this.paint("accent", logo(this.logoStyle, width)),
      message(this.language, "tagline"),
      this.paint("muted", "-".repeat(width))
    ];
    if (subtitle) lines.push(this.paint("muted", subtitle));
    lines.push("", this.paint("accent", title), "");
    for (const [index, item] of items.entries()) {
      const prefix = index === selected ? "> " : "  ";
      lines.push(index === selected ? this.paint("selected", `${prefix}${item}`) : `${prefix}${item}`);
    }
    lines.push("", this.paint("muted", hint));
    output.write(`\x1b[2J\x1b[H${lines.join("\n")}`);
  }
}

function supportsUnicode(): boolean {
  return process.env.MODDOCK_ASCII !== "1" && (process.platform !== "win32" || Boolean(process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.ConEmuANSI));
}

export async function confirmInTerminal(text: string, theme: ThemeName = "default", language: LanguageName = "en"): Promise<boolean> {
  return new TerminalUI(theme, "compact", language).confirm(text);
}
