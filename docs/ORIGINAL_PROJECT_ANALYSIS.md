# Original project analysis

> Historical note: this document describes the project before the TypeScript refactor. ModeDOCK 1.0.0b later added small optional native/managed runtime-compatibility helpers; see `RUNTIME_ARCHITECTURE.md` for the current design.

This document records the state inspected immediately before the ModeDOCK refactor.

## What the original project did

The project was a Windows x64 command-line mod file manager named ModForge. A small npm shim launched a 37.6 MB self-contained .NET executable. It stored game profiles, installed one `.dll` or the contents of one `.zip`, recorded JSON manifests and SHA-256 hashes, backed up overwritten files, and supported list, inspect, enable, disable, uninstall, launch, doctor, and path commands.

## Entry points and operation

- `bin/modforge.js` was the npm `bin` entry and only spawned `dist/win-x64/modforge.exe`.
- `ModForge.Cli/Program.cs` and `CliApplication.cs` parsed direct commands.
- `ModForge.Core/ModEngine.cs` performed planning, copying, backup, hash validation, enable/disable, rollback after caught installation failures, and game launch.
- `ModForge.Core/Store.cs` persisted profiles and one manifest per installed mod.

ZIP entries were extracted into a temporary staging directory. Destinations were lexically constrained to the selected game root. Existing files were copied into per-installation backup directories. Disabled payloads were parked outside the game directory. Active file ownership prevented two enabled mods from managing the same destination.

## Retained behavior

- User-authorized target profiles.
- Relative destination validation and path-traversal rejection.
- Safe archive-entry validation.
- Pre-installation planning.
- Per-file SHA-256 metadata.
- Backups before replacement.
- Rollback after failed operations.
- Active file ownership/conflict detection.
- Reversible enable, disable, and uninstall behavior.
- Human-readable and JSON command output.
- Temporary-directory tests that never touch a real installation.

These behaviors are ported into reusable TypeScript services rather than discarded.

## Problems found

- The npm tarball was 32.2 MB because it bundled a self-contained .NET runtime for a relatively small CLI.
- The package was restricted to Windows x64 even though most file-management logic is portable.
- Running the command without arguments printed help instead of opening an interactive terminal interface.
- Only `.dll` and `.zip` sources were supported; folders, scripts, configuration files, adapters, and custom formats were absent.
- Target profiles exposed only one generic destination and had no loader, plugins directory, config directory, per-format rules, or detection adapter.
- There was no Steam/Epic/standard-location discovery.
- There was no `--dry-run`, installation preview, overwrite confirmation, quiet/verbose behavior, or persistent configuration.
- There were no user-created snapshots, backup listing/restoration, or cleanup commands.
- Rollback handled caught exceptions, but there was no durable transaction journal for recovery after process termination or power loss.
- ZIP extraction had no explicit file-count or uncompressed-size limit.
- Path containment was lexical and did not explicitly reject nested symbolic links/reparse points.
- Direct commands and help text were hand-wired across several C# files, making expansion repetitive.
- The package was `UNLICENSED` and had no final repository metadata.

## Architectural decision

ModeDOCK uses a TypeScript/Node.js runtime for its core file-management workflows, eliminating the old bundled self-contained .NET runtime. The new terminal UI and direct commands call the same core services. Target discovery and file formats are adapter registries, while filesystem mutation, backup, validation, configuration, and logging remain separate modules. Later runtime-compatibility stages added small framework-dependent .NET helpers and a native probe without making them dependencies of ordinary file-management commands.

The old C# implementation was removed after its safety behavior was represented by TypeScript tests. It is no longer included in this GitHub-ready directory. Existing ModForge profiles are still imported non-destructively on first initialization; legacy user files are never deleted automatically.
