# ModeDOCK Core

**A safety-first package and profile engine for game mod launchers, private registries, and server panels.**

ModeDOCK Core is not another mod catalog or graphical manager. It is the infrastructure layer that a launcher, desktop client, hosting panel, or community-specific mod manager can use to:

- resolve package versions and dependencies;
- maintain reproducible game profiles;
- download and verify declared artifacts;
- apply file changes transactionally;
- preserve files that existed before management;
- roll back failed operations;
- detect external changes;
- consume a static registry hosted on GitHub Pages, object storage, or any HTTP server.

Packages are declarative. ModeDOCK Core does **not** execute install scripts, attach to game processes, inject DLLs, bypass anti-cheat, or download arbitrary undeclared files.

## Current status

`0.1.0` is a functional MVP intended for integration and controlled real-world testing. The package format and registry format are versioned but should still be treated as pre-1.0 APIs.

## Requirements

- Node.js 20 or newer
- npm

## Install and verify from source

```bash
npm install
npm run verify
npm run build
```

Run the CLI directly:

```bash
node dist/cli.js --help
```

Test the npm artifact:

```bash
npm pack
npm install -g ./modedock-core-0.1.0.tgz
moddock-core --help
```

## User workflow

### 1. Create a game profile

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

### 2. Add a registry

The registry may be a local file, a `file://` URL, or an HTTPS URL.

```bash
moddock-core registry add coop community ./registry/registry.json
```

### 3. Preview and install a package

```bash
moddock-core add coop author.better-ui@^2.0.0 --dry-run
moddock-core add coop author.better-ui@^2.0.0
```

Dependencies are resolved automatically. The exact result is written to `moddock.lock.json` in the profile state directory.

### 4. Verify, update, or remove

```bash
moddock-core list coop
moddock-core verify coop
moddock-core update coop --dry-run
moddock-core update coop
moddock-core remove coop author.better-ui
```

When a managed package replaced a pre-existing file, removing the package restores the verified original.

## Publisher workflow

A package is a directory containing `moddock.json` and its payload files.

```text
my-mod/
├── moddock.json
├── BetterUI.dll
└── config/default.cfg
```

Package it into a static registry:

```bash
moddock-core pack ./my-mod --out ./registry
moddock-core registry build ./registry --name "Example Community Registry"
```

The resulting directory can be hosted as static files:

```text
registry/
├── registry.json
└── packages/
    └── author.better-ui/
        └── 2.0.0/
            ├── descriptor.json
            └── files/
```

For absolute hosted URLs:

```bash
moddock-core pack ./my-mod \
  --out ./registry \
  --base-url https://mods.example.org/

moddock-core registry build ./registry \
  --base-url https://mods.example.org/
```

## Library API

```ts
import { ModeDockCore } from "@modedock/core";

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

// Display plan.operations to the user, then apply the exact reviewed plan.
if ("operations" in plan) {
  await core.applyPlan(plan);
}
```

## What is implemented

- strict package, descriptor, registry, profile, lockfile, and journal validation;
- SemVer exact, wildcard, caret, tilde, comparator, hyphen, and OR ranges;
- backtracking dependency resolution with conflicts and environment constraints;
- game version, loader, platform, and architecture compatibility checks;
- registry priority and descriptor/artifact SHA-256 verification;
- dry-run plans with filesystem preconditions;
- case-insensitive destination ownership checks;
- target-root containment and nested symlink/junction rejection;
- per-profile process lock;
- write-ahead transaction journal;
- staged downloads and durable temporary files;
- rollback of files, lockfile, and profile requirements;
- preservation and restoration of unmanaged originals;
- integrity verification and interrupted-transaction recovery;
- static registry publisher tools;
- JSON CLI output for GUI and automation integrations.

## Deliberate limitations

- There are no package install scripts or lifecycle hooks.
- Packages currently contain individually addressable files rather than ZIP archives.
- Optional dependencies are declared but are not installed automatically in `0.1.0`.
- Registry signatures and trusted publisher identities are not implemented yet.
- The core does not provide a graphical interface, account system, ratings, moderation, or hosting.
- Switching very large profiles still copies files; overlay/hard-link backends are future work.

## Documentation

- [Russian quick start](docs/QUICKSTART.ru.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Package format](docs/PACKAGE_FORMAT.md)
- [Registry format](docs/REGISTRY_FORMAT.md)
- [Launcher integration](docs/INTEGRATION.md)
- [Security model](SECURITY.md)
- [Publishing](docs/PUBLISHING.md)

## License

MIT
