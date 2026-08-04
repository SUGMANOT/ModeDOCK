# Contributing to ModeDOCK

ModeDOCK is currently `UNLICENSED`. Opening a pull request does not by itself establish redistribution or contribution-license terms; the repository owner must choose and document those terms before accepting outside code.

## Development workflow

1. Use Node.js 20 or newer and run `npm install`.
2. Keep terminal rendering in `src/cli/ui`, argument handling in `src/cli/commands`, reusable behavior in `src/core`, external rules in `src/adapters`, and persistence/filesystem concerns in `src/services`.
3. Run `npm run typecheck`, `npm test`, and `npm run build` before submitting changes.
4. Run `npm run test:install` after changes to package metadata, the build, or the executable entry point.
5. Update README, CHANGELOG, examples, and adapter documentation when behavior changes.

## Safety rules

- Never weaken target-root containment, path traversal checks, nested link checks, archive limits, SHA-256 verification, backups, ownership conflict checks, transaction journals, or rollback behavior.
- Never add anti-cheat/DRM bypasses, process injection, unauthorized manipulation, or automatic download/execution of untrusted mods.
- Mutating operations must have a dry-run or preview and an integration test using temporary directories.
- Never test against real game installations.
- Do not silently overwrite, delete, or repair user files. Report integrity problems and require explicit confirmation.
- Keep human logs free of source file contents and redact user-home paths where practical.

## Dependencies and compatibility

ModeDOCK intentionally has no runtime dependencies after bundling. Before adding a dependency, document the installed-size, startup, maintenance, and security cost. Preserve Node 20 support and test platform-specific behavior behind adapters.

JSON fields used by `--json` and state files are compatibility surfaces. Removing or renaming them requires a major version and a tested migration.

## Adding an adapter

Start with `examples/adapters/example-adapter.ts`. Adapters may detect and route files, but they must not directly mutate target files. Return data to the core installer so safety and rollback remain centralized.
