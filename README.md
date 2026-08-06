<div align="center">

<img src="assets/modedock-logo.png" alt="ModeDOCK logo" width="100%" />

# ModeDOCK Core

**Transactional mod environments and verifiable Challenge Capsules for players, streamers, creators, and launcher developers.**

[![CI](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml/badge.svg)](https://github.com/SUGMANOT/ModeDOCK/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version: 0.2.0](https://img.shields.io/badge/version-0.2.0-black.svg)](CHANGELOG.md)

[Challenge Capsules](#challenge-capsules) · [Quick start](#quick-start) · [For creators](#create-a-capsule) · [Launcher API](#launcher-api) · [Package engine](#package-engine)

</div>

ModeDOCK is a safety-first engine for products and communities built around modded games. It manages exact package environments, previews every mutation, verifies payloads, preserves original files, rolls back failed operations, and recovers interrupted transactions.

Version `0.2.0` adds the project's defining system: **Challenge Capsules**.

A Challenge Capsule is not an executable and does not launch a game. It is a portable challenge contract that:

1. describes the required mod environment;
2. contains an objective, rules, and launcher-facing handoff data;
3. prepares that environment transactionally;
4. issues a tamper-evident session ticket;
5. lets the user start the game however they prefer;
6. captures declared evidence and user claims afterward;
7. produces a machine-readable result bundle;
8. restores the previous package profile when requested.

## Who is it for?

| Audience | What ModeDOCK provides |
| --- | --- |
| Players | Safe temporary challenge setups, clear previews, integrity checks, and restoration of the previous mod profile. |
| Streamers | Repeatable community challenges, participant tickets, copied evidence, claims such as score/time, and JSON results for overlays or bots. |
| Mod and modpack creators | A versioned format for publishing rules, dependencies, compatibility constraints, evidence requirements, and challenge metadata together. |
| Launcher developers | An embeddable TypeScript API for profiles, registries, package transactions, challenge lifecycle, and machine-readable output. |

## Challenge Capsules

A normal modpack answers:

> Which files should be installed?

A Challenge Capsule answers:

> Which environment should be prepared, what is the task, what must remain unchanged, and what result should be collected afterward?

A capsule can define:

- exact or overlay package requirements;
- supported game, loader, platform, and architecture versions;
- objective, rules, notes, difficulty, and estimated duration;
- files or directories to hash before and after a run;
- selected evidence to copy into the result bundle;
- required claims such as score, elapsed time, seed, or completion state;
- metadata for Steam, a custom launcher, an OBS integration, or a Discord bot.

ModeDOCK intentionally **does not start the game**. After a session is armed, the player may use Steam, a desktop shortcut, a mod launcher, or a custom launcher. This keeps process execution outside the capsule trust boundary and makes the same capsule usable in many products.

### Lifecycle

```text
challenge.json
      │
      ▼
   inspect ──► validate format and compatibility
      │
      ▼
   prepare ──► resolve packages, preview/apply transaction, remember old profile
      │
      ▼
      arm ───► verify managed files, snapshot evidence, issue session ticket
      │
      ├──────► user or launcher starts the game
      │
      ▼
    finish ──► compare evidence, record claims, write result bundle
      │
      ▼
   restore ──► return to the previous package requirements
```

The result is useful for automation and sharing, but it is **not an anti-cheat certificate**. SHA-256 integrity makes accidental or casual modification visible; it does not prove player identity or protect against a hostile machine.

## Quick start

### Requirements

- Node.js 20 or newer
- npm

### From source

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm install
npm run verify
npm run build
node dist/cli.js --help
```

### From GitHub Release

Download `sugmanot-modedock-core-0.2.0.tgz` from the latest Release and install it:

```bash
npm install -g ./sugmanot-modedock-core-0.2.0.tgz
moddock-core --version
```

### From GitHub Packages

Configure a GitHub token with `read:packages`:

```bash
npm config set @sugmanot:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN
npm install @sugmanot/modedock-core
```

## Run the Example Challenge Capsule

Create a profile for an installed game or a test directory:

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

Inspect the capsule before changing anything:

```bash
moddock-core capsule inspect \
  ./examples/challenge-capsule/challenge.json \
  --profile coop
```

Preview the package transaction:

```bash
moddock-core capsule prepare \
  coop \
  ./examples/challenge-capsule/challenge.json \
  --dry-run
```

Prepare it for real. The command prints a generated session ID:

```bash
moddock-core capsule prepare \
  coop \
  ./examples/challenge-capsule/challenge.json
```

Arm the session:

```bash
moddock-core capsule arm <session-id> --participant streamer-name
```

Now start the game manually or through any launcher. After the challenge, finish it and provide the claims requested by the capsule:

```bash
moddock-core capsule finish <session-id> \
  --claim score=4200 \
  --claim completed=true \
  --out ./challenge-result
```

The output directory contains:

```text
challenge-result/
├── result.json
└── evidence/
    └── ... copied evidence declared by the capsule
```

Restore the previous package requirements:

```bash
moddock-core capsule restore <session-id>
```

Or finish and restore in one operation:

```bash
moddock-core capsule finish <session-id> \
  --claim score=4200 \
  --claim completed=true \
  --restore
```

## Create a Capsule

Generate a safe starter project:

```bash
moddock-core capsule init ./my-challenge \
  --id creator.my-challenge \
  --game example-game \
  --title "No Healing Run"
```

This creates:

```text
my-challenge/
├── challenge.json
└── README.md
```

A minimal capsule looks like this:

```json
{
  "schemaVersion": 1,
  "id": "creator.no-healing",
  "version": "1.0.0",
  "title": "No Healing Run",
  "audience": ["player", "streamer"],
  "game": {
    "id": "example-game",
    "version": ">=1.5.0 <2.0.0",
    "loader": {
      "id": "bepinex",
      "version": "^5.4.0"
    }
  },
  "environment": {
    "mode": "overlay",
    "packages": {
      "creator.challenge-rules": "^1.0.0"
    }
  },
  "brief": {
    "objective": "Defeat the first boss without using healing items.",
    "rules": [
      "Do not change the managed mod environment after arming the session."
    ],
    "estimatedMinutes": 30,
    "difficulty": "hard"
  },
  "evidence": {
    "requireStableEnvironment": true,
    "watch": [
      {
        "path": "logs/challenge-result.json",
        "capture": "copy",
        "required": false,
        "maxBytes": 1048576
      }
    ],
    "claims": [
      {
        "id": "elapsed-seconds",
        "label": "Elapsed seconds",
        "type": "number",
        "required": true
      },
      {
        "id": "completed",
        "label": "Completed",
        "type": "boolean",
        "required": true
      }
    ]
  },
  "handoff": {
    "label": "Open the game with your normal launcher",
    "instructions": [
      "Keep the ModeDOCK ticket until the run is finished."
    ],
    "consumerData": {
      "obs-scene": "challenge"
    }
  }
}
```

Two environment modes are available:

- `overlay`: retain the player's direct requirements and add or override the capsule requirements;
- `exact`: temporarily replace direct requirements with the capsule's declared set.

Evidence paths must remain below the game root. The root itself, path traversal, symbolic links, Windows reserved names, and NTFS alternate streams are rejected. Evidence copying is size-limited.

See [Challenge Capsules](docs/CHALLENGE_CAPSULES.md) and the [JSON Schema](docs/challenge.schema.json).

## Launcher API

```ts
import { ModeDockCore } from "@sugmanot/modedock-core";

const core = await ModeDockCore.open({
  dataDir: "./launcher-state"
});

const inspection = await core.challenges.inspect(
  "https://community.example/challenges/no-healing.json",
  "coop"
);

if (!inspection.compatible) {
  throw new Error(inspection.compatibilityIssues.join("\n"));
}

const prepared = await core.challenges.prepare(
  "coop",
  inspection.source,
  { dryRun: false }
);

const ticket = await core.challenges.arm(prepared.session!.id, {
  participant: "player-name"
});

// Display ticket.objective, ticket.rules and ticket.handoff in the UI.
// The launcher decides whether and how to start the game.

const finished = await core.challenges.finish(ticket.sessionId, {
  claims: {
    "elapsed-seconds": 812,
    completed: true
  },
  outputDir: "./results/no-healing",
  restore: true
});

console.log(finished.result.verdict);
```

Useful integration points:

- Electron or Tauri launchers can render a dry-run plan before preparation;
- OBS tools can read `ticket` and `result.json` through `--json` output;
- Discord bots can distribute capsule URLs and collect result bundles;
- server panels can use exact environments for scheduled community events;
- custom launchers can consume `handoff.consumerData` without allowing the capsule to execute commands.

## Package Engine

Challenge Capsules use the existing package engine. It is also available independently.

### Package features

- declarative `moddock.json` manifests;
- SemVer dependency resolution and conflicts;
- game, loader, operating-system, and architecture constraints;
- multiple prioritized static registries;
- SHA-256 and declared-size verification;
- dry-run plans with stale-plan protection;
- case-insensitive destination collision detection;
- staged writes, backups, rollback, and recovery;
- restoration of files that existed before ModeDOCK;
- reproducible `moddock.lock.json` files.

### Connect a registry

```bash
moddock-core registry add coop community ./registry/registry.json
```

The registry may be local, a `file://` URL, or HTTPS.

### Install packages directly

```bash
moddock-core add coop author.better-ui@^2.0.0 --dry-run
moddock-core add coop author.better-ui@^2.0.0
moddock-core verify coop
moddock-core update coop
moddock-core remove coop author.better-ui
```

### Publish packages

```bash
moddock-core pack ./my-mod \
  --out ./registry \
  --base-url https://mods.example.org/

moddock-core registry build ./registry \
  --name "Example Community Registry" \
  --base-url https://mods.example.org/
```

Static registries can be hosted on GitHub Pages, object storage, a CDN, or a normal HTTPS server.

## Security Model

ModeDOCK does not:

- execute lifecycle scripts from packages or capsules;
- execute capsule handoff data;
- launch the game;
- inject DLLs or attach to processes;
- bypass DRM or anti-cheat;
- claim that result bundles prove identity or prevent cheating.

Packages and capsules are untrusted input. Only use trusted sources. A mod can execute with the user's privileges when the game loads it, even though ModeDOCK itself never executes the mod. See [`SECURITY.md`](SECURITY.md).

## Current Limitations

- The current user-facing client is a CLI; a graphical launcher is not included.
- Challenge tickets and results are hash-protected but are not publisher-signed yet.
- Evidence is limited to declared files/directories and user-supplied claims; ModeDOCK does not inspect process memory or gameplay.
- Package payloads are individually addressable files rather than ZIP archives.
- Optional package dependencies are declared but are not installed automatically.
- Large profile switches currently copy files; overlay, reflink, and hard-link backends are future work.
- ModeDOCK does not provide accounts, ratings, moderation, hosting, or a central catalog.

## Repository Layout

```text
src/challenge/      capsule lifecycle, evidence capture, tickets and results
src/core/           dependency resolution, planning, transactions, verification
src/registry/       static registry loading and artifact fetching
src/storage/        profile, transaction, challenge state, locks and atomic JSON
src/publisher/      package and registry generation
src/validation/     runtime schemas and trust-boundary validation
src/cli/            command-line interface
examples/           launcher, packages, registries and Challenge Capsule
docs/               formats, architecture, integration and security notes
```

## Documentation

- [Быстрый старт на русском](docs/QUICKSTART.ru.md)
- [Challenge Capsules](docs/CHALLENGE_CAPSULES.md)
- [Challenge Capsule JSON Schema](docs/challenge.schema.json)
- [Architecture](docs/ARCHITECTURE.md)
- [Package format](docs/PACKAGE_FORMAT.md)
- [Registry format](docs/REGISTRY_FORMAT.md)
- [Launcher integration](docs/INTEGRATION.md)
- [Publishing](docs/PUBLISHING.md)
- [Security model](SECURITY.md)

## Development

```bash
npm install
npm run typecheck
npm test
npm pack --dry-run
```

CI runs on Windows, Linux, and macOS using Node.js 20 and 22.

## License

MIT
