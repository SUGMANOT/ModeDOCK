# Changelog

All notable public changes to ModeDOCK are documented here.

## Unreleased

- No changes yet.

## 1.0.0b - 2026-08-04

First public beta. The npm-compatible package version is `1.0.0-beta.0`.

### File management

- Added English/Russian CLI and TUI workflows with live language and theme changes.
- Added one-folder target creation, focused Steam/Epic discovery, profiles, loader-aware routing, and safe local ZIP/folder/file installation.
- Added dry-run plans, target-root containment, ZIP traversal protection, ownership checks, SHA-256 integrity, backups, snapshots, transaction journals, rollback, enable/disable/reinstall/remove, and recovery diagnostics.
- Improved duplicate installs, forced reinstalls of locally changed payloads, target-in-use guidance, JavaScript module variants, and application-package detection.
- Fixed TUI frame overlap, settings closing after each change, and Exit keeping the terminal process attached.

### Runtime compatibility foundation

- Added metadata-only PE inspection and ModeDOCK Native ABI v1 (`N1`) detection.
- Added an isolated Windows x64 native probe with timeout, crash containment, Job Object restrictions, and no PID/attach functionality.
- Added a metadata-only managed inspector for BepInEx/Harmony/Unity signals.
- Added ModeDOCK-owned experimental `BepInEx.dll`, `UnityEngine.dll`, and `0Harmony.dll` compatibility shims.
- Added controlled B1/B2 plugin loading and cooperative H1-H4 behavior tests.
- Added one allowlisted `sample-unity-mono` adapter with transactional bootstrap, profile-filtered launch, doctor, uninstall, and rollback.
- Kept unknown games, arbitrary process injection, commercial-game method detours, anti-cheat bypass, and unsupported plugin Transpilers blocked explicitly.

### Distribution

- Added a verified Windows installer that can provision portable Node.js when needed.
- Added one-command TypeScript/managed/native builds and a pinned, checksum-verified temporary Zig toolchain.
- Kept the npm artifact below 1 MiB unpacked with zero npm runtime dependencies.
- Added release verification, isolated global-install testing, GitHub CI, issue templates, security policy, and publishing documentation.

### Known beta limitations

- Runtime support is a controlled compatibility foundation, not universal BepInEx/Harmony compatibility.
- The only runtime-launch target is the repository fixture; unknown commercial games fail closed.
- Managed inspection/runtime commands require .NET 10; core file management does not.
- The repository remains `UNLICENSED` until its owner chooses a public license.
