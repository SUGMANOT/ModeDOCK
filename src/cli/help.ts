export const HELP = `ModeDOCK Core 0.2

Transactional package engine and Challenge Capsule protocol for players, streamers, creators, and launchers.

USAGE
  moddock-core profile create <id> --game <game-id> --root <path> [options]
  moddock-core profile list | show <id> | delete <id>

  moddock-core registry add <profile> <name> <registry.json>
  moddock-core registry remove <profile> <name>
  moddock-core registry build <registry-root> [--out <file>] [--name <name>]

  moddock-core add <profile> <package[@range]> [--dry-run]
  moddock-core remove <profile> <package> [--dry-run]
  moddock-core sync <profile> [--dry-run]
  moddock-core update <profile> [package] [--dry-run]
  moddock-core list <profile>
  moddock-core verify <profile>

CHALLENGE CAPSULES
  moddock-core capsule init <directory> --id <id> --game <game-id> [--title <title>]
  moddock-core capsule inspect <challenge.json> [--profile <profile>]
  moddock-core capsule prepare <profile> <challenge.json> [--dry-run]
  moddock-core capsule arm <session-id> [--participant <name>]
  moddock-core capsule finish <session-id> [--claim <id=value>]... [--out <dir>] [--restore]
  moddock-core capsule restore <session-id> [--dry-run]
  moddock-core capsule status [session-id]

  A Challenge Capsule prepares and verifies an environment, issues a session ticket,
  and captures a tamper-evident result bundle. It never starts the game itself.

OTHER COMMANDS
  moddock-core pack <mod-directory> --out <registry-root>
  moddock-core transactions
  moddock-core recover <transaction-id>
  moddock-core doctor <profile>

GLOBAL OPTIONS
  --data-dir <path>   Core state directory
  --json              Machine-readable output
  --dry-run           Resolve and display changes without modifying files

PROFILE OPTIONS
  --name <name>
  --version <game-version>
  --loader <loader-id>
  --loader-version <version>
  --dest <id=relative/path>   Repeatable; replaces default destination map
`;
