export const FULL_LOGO = [
  " __  __           _      ____   ___   ____ _  __",
  "|  \\/  | ___   __| | ___|  _ \\ / _ \\ / ___| |/ /",
  "| |\\/| |/ _ \\ / _` |/ _ \\ | | | | | | |   | ' /",
  "| |  | | (_) | (_| |  __/ |_| | |_| | |___| . \\",
  "|_|  |_|\\___/ \\__,_|\\___|____/ \\___/ \\____|_|\\_\\"
].join("\n");

export const COMPACT_LOGO = "[ ModeDOCK ]";

export function logo(style: "full" | "compact", width = process.stdout.columns ?? 80): string {
  return style === "compact" || width < 72 ? COMPACT_LOGO : FULL_LOGO;
}
