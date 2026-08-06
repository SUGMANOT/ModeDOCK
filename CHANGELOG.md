# Changelog

## 0.2.0 - 2026-08-06

- Added the versioned Challenge Capsule manifest format.
- Added capsule compatibility inspection for game, loader, platform, and architecture.
- Added overlay and exact challenge environment modes.
- Added transactional challenge preparation with previous-profile restoration.
- Added session tickets containing objective, rules, nonce, environment fingerprint, baseline hash, and integrity.
- Added safe evidence snapshots for declared files and directories.
- Added optional bounded evidence copying into result bundles.
- Added typed claims for scores, times, completion flags, seeds, and other participant-supplied data.
- Added result verdicts, environment stability checks, evidence deltas, and canonical result integrity.
- Added Challenge Capsule CLI commands: init, inspect, prepare, arm, finish, restore, and status.
- Added the public `core.challenges` TypeScript API.
- Added an Example Challenge Capsule, JSON Schema, integration guide, Russian quick start, and expanded security documentation.
- Clarified that ModeDOCK never launches the game or executes capsule handoff data.
- Expanded the test suite from 12 to 15 tests.

## 0.1.0 - 2026-08-06

- Added versioned declarative package and static registry formats.
- Added game profiles with logical destination mappings.
- Added SemVer dependency resolution, conflicts, and environment compatibility.
- Added reproducible lockfiles and package ownership tracking.
- Added dry-run plans with stale-plan filesystem preconditions.
- Added staged artifact downloads with SHA-256 and size verification.
- Added transaction journals, rollback, profile mutexes, and recovery.
- Added original-file preservation across package updates and removal.
- Added integrity verification.
- Added package and registry publisher commands.
- Added a CLI and public TypeScript API.
- Added automated GitHub Releases with npm tarballs and SHA-256 checksums.
- Added GitHub Packages publication as `@sugmanot/modedock-core`.
- Added an idempotent release workflow for verified pushes to `main`.
