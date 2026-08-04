# ModeDOCK 1.0.0b technical summary

## Product boundary

ModeDOCK is a Node.js 20+ CLI/TUI for transactional management of user-selected local mod files. Its core file-manager is separated from the experimental runtime-compatibility layer. It does not download mods, attach to arbitrary processes, provide a universal injector, bypass anti-cheat/DRM, or silently continue for unknown game versions.

## Core file management

- One-folder profiles with executable, loader, and destination inference.
- Focused Steam/Epic discovery and reusable target profiles.
- Local file, folder, and bounded ZIP input.
- Loader-aware root/mod/plugin/config routing.
- Dry-run plans, target-root containment, nested-link and ZIP-traversal refusal.
- Backup-before-overwrite, SHA-256 integrity, ownership conflicts, atomic writes, journals, rollback, snapshots, and interrupted-operation recovery.
- Enable, disable, reinstall, remove, doctor, JSON, quiet, and verbose workflows.
- English/Russian live TUI settings and clean terminal shutdown.

## Runtime compatibility foundation

- Metadata-only PE inspection and ModeDOCK Native ABI v1 (`N1`).
- Separate Windows native probe with bounded execution and crash containment.
- Metadata-only managed assembly inspection.
- ModeDOCK-owned experimental BepInEx B1/B2 and cooperative Harmony H1-H4 shims/harnesses.
- One allowlisted controlled Unity-Mono fixture adapter with transactional bootstrap and fail-closed version checks.

The controlled Harmony harness is not evidence of arbitrary commercial-game detouring. The game-plugin planner continues to reject unsupported Transpiler usage explicitly.

## Distribution

The npm artifact contains the bundled CLI, native/managed helpers, public ABI header, required documentation, and metadata. It has zero npm runtime dependencies and is rejected by the package test above 1 MiB unpacked. Development builds use deterministic C# settings and a pinned checksum-verified temporary Zig toolchain for the native helper.

Release verification runs TypeScript strict checking, 27 integration/unit tests, interactive terminal regression coverage, full native/managed/TypeScript builds, and an isolated global installation test.
