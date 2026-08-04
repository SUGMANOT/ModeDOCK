# ModeDOCK 1.0.0b

Package version: `1.0.0-beta.0`

Recommended Git tag: `v1.0.0b`

This is the first public beta of ModeDOCK: a safety-first CLI/TUI for transactional local mod management plus an experimental, fail-closed runtime compatibility foundation.

## Highlights

- One-folder game profiles, Steam/Epic discovery, loader-aware routing, and a profiles screen.
- Local file/folder/ZIP installation with dry-run, SHA-256, backups, ownership checks, journals, rollback, snapshots, and recovery.
- English/Russian live settings and a terminal interface that exits cleanly.
- Static PE inspection, isolated Native ABI N1 probing, managed metadata inspection, controlled B2 and cooperative H1-H4 harnesses.
- One allowlisted controlled Unity-Mono fixture adapter; unknown games are rejected.
- Zero npm runtime dependencies and an unpacked package-size ceiling of 1 MiB.

## Important limitations

- ModeDOCK is not a universal DLL injector and does not attach to arbitrary processes.
- It does not bypass anti-cheat, DRM, or operating-system protections.
- BepInEx/Harmony compatibility is partial and tested in controlled harnesses, not arbitrary commercial games.
- The repository is `UNLICENSED` until its owner chooses a public license.

## Verification before publishing

```powershell
npm ci
npm run verify:release
node dist/moddock.js --version
```

Expected version output: `1.0.0b`.
