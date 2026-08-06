<div align="center">

# ModeDOCK Core

**A transactional package engine for game mod launchers, community registries, and server panels.**

[![CI](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml/badge.svg)](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: beta](https://img.shields.io/badge/status-beta-f59e0b.svg)](CHANGELOG.md)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Library API](#library-api) · [Package publishing](#package-publishing) · [Documentation](#documentation)

</div>

ModeDOCK Core is infrastructure, not a competing mod catalog or graphical manager. It gives a launcher or hosting panel a strict package model, dependency resolver, reproducible profiles, verified downloads, transactional file operations, rollback, and recovery.

A product built on ModeDOCK can provide a familiar **Install / Update / Remove / Verify** experience without reimplementing the dangerous filesystem layer.

## Why use it

- **Declarative packages.** Every installed file, destination, dependency, conflict, and compatibility constraint is described in `moddock.json`.
- **Reproducible profiles.** Exact resolved versions and owned files are recorded in `moddock.lock.json`.
- **Safe previews.** Mutations are represented as a plan that can be shown to the user before it is applied.
- **Verified artifacts.** Package descriptors and payloads are checked by SHA-256 and declared size.
- **Transactional changes.** Per-profile locks, staging, write-ahead journals, backups, rollback, and interrupted-operation recovery protect the game directory.
- **Static registries.** A registry can be hosted on GitHub Pages, object storage, a CDN, or an ordinary HTTPS server.
- **Embeddable API.** The same TypeScript API can power Electron, Tauri, a custom launcher, a server panel, or automation.

ModeDOCK Core does **not** execute package lifecycle scripts, inject DLLs, attach to processes, bypass DRM or anti-cheat, or claim to sandbox a plugin after a game loads it.

## Status

Version `0.1.0` is a functional beta for integration and controlled real-world testing. Package, registry, profile, lockfile, and recovery formats are versioned, but remain pre-1.0 APIs.

## Quick start

### Requirements

- Node.js 20 or newer
- npm

### Build and verify

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm install
npm run verify
```

Run the CLI:

```bash
npm run build
node dist/cli.js --help
```

Install the CLI from the tarball attached to the GitHub Release:

```bash
npm install -g ./sugmanot-modedock-core-0.1.0.tgz
moddock-core --help
```

Install the library from GitHub Packages after configuring an npm token with `read:packages`:

```bash
npm config set @sugmanot:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN
npm install @sugmanot/modedock-core
```

For local development, `npm pack` produces the same installable tarball format.

### Create a profile

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

### Connect a registry

A registry location may be a local path, a `file://` URL, or an HTTPS URL.

```bash
moddock-core registry add coop community ./registry/registry.json
```

### Preview and install

```bash
moddock-core add coop author.better-ui@^2.0.0 --dry-run
moddock-core add coop author.better-ui@^2.0.0
```

Dependencies are resolved automatically. The exact result is written to the profile's `moddock.lock.json`.

### Maintain the profile

```bash
moddock-core list coop
moddock-core verify coop
moddock-core update coop --dry-run
moddock-core update coop
moddock-core remove coop author.better-ui
```

If a managed package replaced an existing file, removal restores the verified original.

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

A typical integration follows this sequence:

1. Create or open a profile describing the game, loader, platform, and destination mappings.
2. Add one or more registries with explicit priority.
3. Ask Core to resolve a requested package and produce an immutable installation plan.
4. Display the operations and warnings in the product UI.
5. Apply that exact reviewed plan.
6. Verify managed files later or recover an interrupted transaction during startup.

## Library API

```ts
import { ModeDockCore } from "@sugmanot/modedock-core";

const core = await ModeDockCore.open({
  dataDir: "./launcher-state"
});

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

const plan = await core.add("coop", "author.better-ui@^2", {
  dryRun: true
});

// Render plan.operations in the UI, then apply the reviewed plan.
if ("operations" in plan) {
  await core.applyPlan(plan);
}
```

See [`examples/launcher.mjs`](examples/launcher.mjs) and the [integration guide](docs/INTEGRATION.md) for a fuller embedding example.

## Package publishing

A package is a directory containing `moddock.json` and its payload:

```text
my-mod/
├── moddock.json
├── BetterUI.dll
└── config/
    └── default.cfg
```

Build a static registry:

```bash
moddock-core pack ./my-mod --out ./registry
moddock-core registry build ./registry --name "Example Community Registry"
```

Output:

```text
registry/
├── registry.json
└── packages/
    └── author.better-ui/
        └── 2.0.0/
            ├── descriptor.json
            └── files/
```

For public hosting, provide the base URL during packaging and registry generation:

```bash
moddock-core pack ./my-mod \
  --out ./registry \
  --base-url https://mods.example.org/

moddock-core registry build ./registry \
  --base-url https://mods.example.org/
```

## Implemented capabilities

- strict runtime validation for package descriptors, registries, profiles, lockfiles, and journals;
- SemVer exact, wildcard, caret, tilde, comparator, hyphen, and OR ranges;
- backtracking dependency resolution with package conflicts and environment constraints;
- game, loader, operating-system, and architecture compatibility checks;
- registry priority plus descriptor and artifact integrity verification;
- dry-run plans with filesystem preconditions that reject stale plans;
- case-insensitive destination ownership and collision detection;
- target-root containment and nested symlink/junction rejection;
- per-profile process locking;
- staged downloads and durable temporary files;
- write-ahead transaction journals and rollback;
- preservation and restoration of unmanaged originals;
- integrity verification and startup recovery;
- static registry publisher tools;
- JSON output for GUI and automation integrations;
- CI on Windows, Linux, and macOS with Node.js 20 and 22.

## Deliberate limitations

- No install scripts or lifecycle hooks.
- Package payloads are individually addressable files rather than ZIP archives.
- Optional dependencies are declared but are not installed automatically in `0.1.0`.
- Registry signatures and trusted publisher identities are not implemented yet.
- Core does not provide a GUI, accounts, ratings, moderation, discovery, or hosting.
- Large profile switches currently copy files; overlay and hard-link backends are future work.

## Repository layout

```text
src/core/          resolution, planning, transactions, verification
src/registry/      registry loading and artifact fetching
src/storage/       profile state, locks, paths, and atomic JSON
src/publisher/     package and static-registry generation
src/validation/    runtime schemas and trust-boundary validation
src/cli/           command-line interface
examples/          sample launcher, package, and registry
docs/              formats, architecture, integration, and publishing
```

## Documentation

- [Быстрый старт на русском](docs/QUICKSTART.ru.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Package format](docs/PACKAGE_FORMAT.md)
- [Registry format](docs/REGISTRY_FORMAT.md)
- [Launcher integration](docs/INTEGRATION.md)
- [Security model](SECURITY.md)
- [Publishing](docs/PUBLISHING.md)

## Security

Packages are untrusted input. ModeDOCK validates paths, sizes, hashes, environment constraints, and state files, but a mod may execute with the user's privileges when the game loads it. Only use trusted registries and packages. Report security issues through GitHub's private vulnerability reporting flow; see [`SECURITY.md`](SECURITY.md).

## License

MIT
