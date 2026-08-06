<div align="center">

# ModeDOCK Core

**A transactional package engine for game mod launchers, community registries, and server panels.**

[![CI](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml/badge.svg)](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: beta](https://img.shields.io/badge/status-beta-f59e0b.svg)](CHANGELOG.md)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Library API](#library-api) · [Package publishing](#package-publishing) · [Documentation](#documentation)

</div>

ModeDOCK Core is infrastructure, not another mod catalog or graphical manager. It gives a launcher or hosting panel a strict package model, dependency resolver, reproducible profiles, verified downloads, transactional file operations, rollback, and recovery.

A product built on ModeDOCK can provide a familiar **Install / Update / Remove / Verify** workflow without reimplementing the dangerous filesystem layer.

## Why use it

- **Declarative packages.** Files, destinations, dependencies, conflicts, and compatibility constraints are described in `moddock.json`.
- **Reproducible profiles.** Exact versions and file ownership are recorded in `moddock.lock.json`.
- **Safe previews.** Every mutation is represented as a plan that can be reviewed before application.
- **Verified artifacts.** Descriptors and payloads are checked by SHA-256 and declared size.
- **Transactional changes.** Locks, staging, journals, backups, rollback, and startup recovery protect the game directory.
- **Static registries.** Host a registry on GitHub Pages, object storage, a CDN, or any HTTPS server.
- **Embeddable API.** Use the same TypeScript API in Electron, Tauri, a custom launcher, a server panel, or automation.

ModeDOCK Core does **not** execute lifecycle scripts, inject DLLs, attach to game processes, bypass DRM or anti-cheat, or claim to sandbox a plugin after the game loads it.

## Status

Version `0.1.0` is a functional beta for integration and controlled real-world testing. Its package, registry, profile, lockfile, and recovery formats are versioned but remain pre-1.0 APIs.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm install
npm run verify
npm run build
node dist/cli.js --help
```

Create a profile:

```bash
moddock-core profile create coop \
  --game example-game \
  --root "C:\\Games\\Example" \
  --version 1.5.0 \
  --loader bepinex \
  --loader-version 5.4.23 \
  --dest root=. \
  --dest plugins=BepInEx/plugins \
  --dest config=BepInEx/config
```

Connect a local or hosted registry and install a package:

```bash
moddock-core registry add coop community ./registry/registry.json
moddock-core add coop author.better-ui@^2.0.0 --dry-run
moddock-core add coop author.better-ui@^2.0.0
```

Maintain the profile:

```bash
moddock-core list coop
moddock-core verify coop
moddock-core update coop --dry-run
moddock-core update coop
moddock-core remove coop author.better-ui
```

Dependencies are resolved automatically. The exact result is saved in the profile's `moddock.lock.json`. If a package replaced an existing file, removal restores the verified original.

## How it works

```text
Launcher / desktop client / server panel
                    │
                    ▼
              ModeDOCK Core
   ┌────────────────┼─────────────────┐
   ▼                ▼                 ▼
Registry       Dependency         Transaction
client         resolver           engine
   │                │                 │
   ▼                ▼                 ▼
Descriptors     Exact package     Stage → verify
and artifacts   graph + lockfile  → apply → recover
```

A launcher creates a profile, connects registries, requests an immutable installation plan, shows `plan.operations` to the user, and applies that exact reviewed plan. On later startup it can verify files or recover an interrupted transaction.

## Library API

```ts
import { ModeDockCore } from "@modedock/core";

const core = await ModeDockCore.open({ dataDir: "./launcher-state" });

await core.createProfile({
  id: "coop",
  gameId: "example-game",
  gameVersion: "1.5.0",
  rootDir: "C:/Games/Example",
  loaderId: "bepinex",
  loaderVersion: "5.4.23",
  destinations: {
    root: ".",
    plugins: "BepInEx/plugins",
    config: "BepInEx/config"
  }
});

await core.addRegistry("coop", {
  name: "community",
  location: "https://mods.example.org/registry.json"
});

const plan = await core.add("coop", "author.better-ui@^2", { dryRun: true });

if ("operations" in plan) {
  await core.applyPlan(plan);
}
```

See [`examples/launcher.mjs`](examples/launcher.mjs) and [Launcher integration](docs/INTEGRATION.md).

## Package publishing

A package is a directory containing `moddock.json` and payload files:

```text
my-mod/
├── moddock.json
├── BetterUI.dll
└── config/default.cfg
```

Build a static registry:

```bash
moddock-core pack ./my-mod --out ./registry
moddock-core registry build ./registry --name "Example Community Registry"
```

For public hosting, add `--base-url https://mods.example.org/` to both commands.

## Implemented capabilities

- strict runtime validation for packages, registries, profiles, lockfiles, and journals;
- SemVer ranges and backtracking dependency resolution;
- package conflicts and game, loader, OS, and architecture constraints;
- registry priority and descriptor/artifact integrity verification;
- dry-run plans with stale-plan filesystem preconditions;
- destination ownership, collision, path traversal, and symlink/junction protection;
- per-profile locking, staged downloads, write-ahead journals, and rollback;
- preservation and restoration of unmanaged originals;
- integrity verification and interrupted-operation recovery;
- static registry publishing and JSON CLI output;
- CI on Windows, Linux, and macOS with Node.js 20 and 22.

## Deliberate limitations

- No package scripts or lifecycle hooks.
- Payloads are individually addressable files rather than ZIP archives.
- Optional dependencies are not installed automatically in `0.1.0`.
- Registry signatures and trusted publisher identities are not implemented yet.
- Core does not provide a GUI, accounts, ratings, moderation, discovery, or hosting.
- Large profile switches currently copy files; overlay and hard-link backends are future work.

## Documentation

- [Быстрый старт на русском](docs/QUICKSTART.ru.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Package format](docs/PACKAGE_FORMAT.md)
- [Registry format](docs/REGISTRY_FORMAT.md)
- [Launcher integration](docs/INTEGRATION.md)
- [Security model](SECURITY.md)
- [Publishing](docs/PUBLISHING.md)

## Security

Packages are untrusted input. ModeDOCK validates paths, sizes, hashes, environment constraints, and state files, but a mod may execute with the user's privileges when the game loads it. Only use trusted registries and packages. Report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md).

## License

MIT
