export const HELP = `ModeDOCK Core 0.1

Safety-first package engine for game mod launchers and private registries.

USAGE
  moddock-core profile create <id> --game <game-id> --root <path> [options]
  moddock-core profile list
  moddock-core profile show <id>
  moddock-core profile delete <id>

  moddock-core registry add <profile> <name> <registry.json>
  moddock-core registry remove <profile> <name>
  moddock-core registry build <registry-root> [--out <file>] [--name <name>]

  moddock-core add <profile> <package[@range]> [--dry-run]
  moddock-core remove <profile> <package> [--dry-run]
  moddock-core sync <profile> [--dry-run]
  moddock-core update <profile> [package] [--dry-run]
  moddock-core list <profile>
  moddock-core verify <profile>

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

PACKAGE FORMAT
  Put a moddock.json manifest and its payload files in one directory, then run:

    moddock-core pack ./my-mod --out ./registry
    moddock-core registry build ./registry
`;
