export const ROOT_HELP = `ModeDOCK - Mod and Plugin Integration CLI

USAGE
  moddock                         Open the interactive terminal interface
  moddock <command> [options]     Run a direct command

COMMANDS
  init                            Initialize configuration and import legacy profiles
  install <path>                  Install a file, folder, or ZIP package
  list                            List installed mods and plugins
  info <name-or-id>               Inspect installation metadata
  enable <name-or-id>             Enable a managed item
  disable <name-or-id>            Disable a managed item
  remove <name-or-id>             Remove and restore originals
  reinstall <name-or-id>          Reinstall from the recorded source
  target add|edit|list|select|inspect|remove|validate|detect
  backup create|list|restore|remove|prune|recover
  config list|get|set|reset
  doctor                          Check runtime, permissions, targets, and state
  dll inspect|probe <path>        Inspect a DLL or run an explicit isolated ABI probe
  plugin inspect <path>           Inspect managed plugin metadata without executing code
  runtime status|install|uninstall|doctor
  launch <target> --profile <p>   Launch an allowlisted target through its GameAdapter
  update                          Check for an npm update
  paths                           Show per-user data locations
  help [command]                  Show help

GLOBAL OPTIONS
  --target <name-or-id>           Select a target for this command
  --force                         Confirm overwrite/destructive behavior
  --dry-run                       Show planned changes without changing target files
  --json                          Emit machine-readable JSON
  --quiet                         Suppress successful output
  --verbose                       Print diagnostic log events
  --no-backup                     Skip backups only when no existing files are replaced
  --config <path>                 Use a custom configuration file
  --data-dir <path>               Override per-user state storage
  -h, --help                      Show help
  -v, --version                   Show the version`;

export const HELP: Record<string, string> = {
  install: `moddock install <path> [--target <target>] [--destination <root|mods|plugins|config|relative>] [--dry-run] [--force] [--no-backup]`,
  target: `moddock target add --root <installation-directory> [--name N --exe P --mods-dir P --plugins-dir P --config-dir P --loader N]
moddock target edit <target> [same options]
moddock target list | select <target> | inspect [target] | remove <target> | validate [target]
moddock target detect [--adapter steam|epic] [--add <detection-id>]`,
  backup: `moddock backup create [--name N] [--target T]
moddock backup list [--target T]
moddock backup restore <id> [--dry-run] [--force]
moddock backup remove <id> [--force]
moddock backup prune --keep <count> [--force]
moddock backup recover`,
  config: `moddock config list
moddock config get <key>
moddock config set <key> <value>
moddock config reset [--force]`,
  doctor: `moddock doctor [--target <target>] [--json]`,
  update: `moddock update [--force]`,
  dll: `moddock dll inspect <path> [--json]\nmoddock dll probe <path> [--execute-probe] [--force] [--json]\nmoddock dll manifest <path> [--json]\n\nInspection and manifest generation never load the DLL. Dynamic ABI calls run only in the separate Windows helper after --execute-probe and confirmation; use --force for non-interactive scripts.`,
  plugin: `moddock plugin inspect <managed-dll> [--json]\nmoddock plugin compatibility <managed-dll-or-installed-id> [--target T] [--json]\nmoddock plugin install <path> [--target T] [--dry-run]\nmoddock plugin enable|disable <id> [--target T] [--dry-run]\n\nInspection is metadata-only. Install/enable/disable reuse the transactional file manager.`,
  runtime: `moddock runtime status [target] [--json]\nmoddock runtime install <target> [--dry-run] [--force]\nmoddock runtime uninstall <target> [--dry-run] [--force]\nmoddock runtime doctor <target> [--json]\nmoddock launch <target> --profile <profile> [--json]\n\nRuntime operations work only through an allowlisted GameAdapter. No PID, attach, or arbitrary-process injection is available.`
};

export function printHelp(topic?: string): void { process.stdout.write(`${topic && HELP[topic] ? HELP[topic] : ROOT_HELP}\n`); }
