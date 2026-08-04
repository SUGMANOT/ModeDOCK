<div align="center">

<picture>
  <img width="1143" height="359" alt="ModeDOCK logo" src="https://github.com/user-attachments/assets/ea0eb3a5-4a7e-4e35-80a2-e0fb76c84454" />
</picture>

# ModeDOCK

**A safety-first terminal manager for local game mods and plugins.**

Install, organize, verify, backup and recover user-selected mod files with a CLI/TUI workflow designed around predictable file ownership and rollback.

[![Status](https://img.shields.io/badge/status-beta-f59e0b?style=for-the-badge)](https://github.com/SUGMANOT/ModeDOCK)
[![Node.js](https://img.shields.io/badge/node-20%2B-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-111827?style=for-the-badge)](LICENSE)

[Features](#features) · [Installation](#installation) · [Safety](#safety) · [Development](#development)

</div>

---

## Overview

ModeDOCK is a local mod and plugin manager focused on safe file operations.

It provides:

- game profiles and loader-aware routing;
- install previews before changes are applied;
- automatic backups and snapshots;
- transaction journals and recovery;
- SHA-256 integrity verification;
- interactive terminal UI and scriptable CLI commands.

ModeDOCK does **not** download mods, bypass DRM, bypass anti-cheat, inject into arbitrary processes, or attach to running games.

## Features

| Feature | Description |
| --- | --- |
| Profiles | Separate configurations for games and applications |
| Installation planning | Preview every file change before execution |
| Backups | Restore replaced files safely |
| Recovery | Roll back interrupted operations |
| Integrity | SHA-256 verification and ownership checks |
| CLI/TUI | Keyboard interface and automation support |
| Integrations | Loader-aware routing for supported layouts |

## Installation

### From source

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm ci
npm run verify
npm run dev
```

### Global install test

```bash
npm pack
npm install -g ./moddock-1.0.0-beta.0.tgz
moddock
```

## Quick start

```bash
moddock target add --root "C:\Games\Example"
moddock install ./plugin.dll --dry-run
moddock install ./plugin.dll
moddock list
moddock doctor
```

## Safety

ModeDOCK validates paths, blocks unsafe archive layouts, records ownership, creates backups before replacement, and keeps recovery journals during multi-file operations.

Third-party mods and plugins are executable content. Only install files you trust.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapters](docs/ADAPTERS.md)
- [Game integrations](docs/GAME_ADAPTERS.md)
- [Security](SECURITY.md)
- [Publishing](docs/PUBLISHING.md)

## Development

Requirements:

- Node.js 20+
- npm

Useful commands:

```bash
npm run typecheck
npm test
npm run verify
npm run verify:release
```

## License

ModeDOCK is released under the MIT License.
