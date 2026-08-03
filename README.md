<picture>
  <img width="1143" height="359" alt="modedock-logo-light" src="https://github.com/user-attachments/assets/ea0eb3a5-4a7e-4e35-80a2-e0fb76c84454" />
</picture>

<h1 align="center">ModeDOCK</h1>

<p align="center">
  A terminal application for installing and managing local game mods and application plugins.
</p>

<p align="center">
  <a href="https://nodejs.org/">
    <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white">
  </a>
  <a href="https://www.npmjs.com/">
    <img alt="npm" src="https://img.shields.io/badge/npm-CLI-CB3837?logo=npm&logoColor=white">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript&logoColor=white">
  </a>
  <a href="#requirements">
    <img alt="Windows, macOS and Linux" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-5C6BC0">
  </a>
  <a href="#license">
    <img alt="License: UNLICENSED" src="https://img.shields.io/badge/license-UNLICENSED-lightgrey">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#requirements">Requirements</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick start</a> •
  <a href="#settings">Settings</a> •
  <a href="#safety-model">Safety</a> •
  <a href="#development">Development</a>
</p>

---

## Overview

ModeDOCK provides an interactive keyboard interface for everyday use and a stable command-line interface for npm scripts and automation.

> [!IMPORTANT]
> ModeDOCK does **not** download mods, inject code into processes, install a mod loader, bypass DRM, or bypass anti-cheat software. It only manages files that the user explicitly selects.

---

## Features

- Create reusable profiles for games and desktop applications.
- Detect some Steam, Epic, and standard installations, or use any manually configured path.
- Install a local file, folder, or ZIP archive.
- Preview every destination before writing files.
- Route files to the target's root, `Mods`, `Plugins`, or `Config` directory.
- Enable, disable, reinstall, and remove managed items.
- Back up files before replacement and restore originals on removal.
- Create named snapshots and recover interrupted installations.
- Verify managed files with SHA-256 hashes and detect ownership conflicts.
- Produce machine-readable output with `--json` and safe previews with `--dry-run`.
- Use English or Russian in the interactive interface.
- Choose a cyan, monochrome, or amber interface theme.

The interactive interface and direct commands call the same core services. Changing the interface language does not change command names, so existing scripts continue to work.

---

## Requirements

| Component | Requirement |
| --- | --- |
| [Node.js](https://nodejs.org/) | Version 20 or newer |
| [npm](https://www.npmjs.com/) | Required |
| Operating system | Windows, macOS, or Linux |

> [!NOTE]
> Automatic game detection depends on the platform and launcher. Manual target profiles work everywhere Node.js is supported.

---

## Installation

### Run from source

```bash
git clone <repository-url>
cd ModeDOCK
npm install
npm run verify
npm run dev
```

`npm run dev` builds ModeDOCK and opens the interactive interface.

### Test as a global command

Use `npm pack` to test the CLI globally without publishing it:

```bash
npm pack
npm install -g ./moddock-2.0.0.tgz
moddock --version
moddock
```

### Install from npm

After the package is published to npm, installation will be:

```bash
npm install -g moddock
moddock
```

---

## Quick start

Start the interactive interface:

```bash
moddock
```

Use <kbd>↑</kbd>/<kbd>↓</kbd> to move, <kbd>Enter</kbd> to select, and <kbd>Esc</kbd> to go back.

1. Open **Games and applications**.
2. Create or select a game profile.
3. Choose **Install a mod or plugin**.
4. Review the planned destination paths.
5. Confirm the installation.

ModeDOCK shows the complete file plan before applying changes.

### Direct commands

The same workflow is available through the CLI:

```bash
moddock target add --name "Example Game" --root "C:\Games\Example" --exe "Example.exe"
moddock install ./plugin.dll --dry-run
moddock install ./plugin.dll
moddock list
moddock disable plugin
moddock enable plugin
moddock remove plugin
moddock doctor
```

Run `moddock --help` for the full command list or read [`COMMANDS.md`](COMMANDS.md).

---

## Settings

Open **Settings** in the interactive interface to change:

- interface language;
- color theme;
- logo style;
- automatic backups;
- removal confirmations;
- target detection.

Visual changes apply immediately. English is the default language.

Settings can also be changed from a shell:

```bash
moddock config list
moddock config set language ru
moddock config set theme amber
moddock config set logoStyle compact
moddock config set automaticDetection false
moddock config reset --force
```

### Supported values

| Setting | Values |
| --- | --- |
| `language` | `en`, `ru` |
| `theme` | `default`, `mono`, `amber` |
| `logoStyle` | `full`, `compact` |
| `logLevel` | `error`, `warn`, `info`, `debug` |

---

## Safety model

ModeDOCK:

- validates target paths;
- blocks ZIP path traversal and nested links;
- checks size limits and file ownership;
- creates transaction journals;
- rolls back failed multi-file installations;
- requires confirmation and a backup before replacing unmanaged files.

### Useful safety commands

```bash
moddock install ./mod.zip --dry-run
moddock doctor
moddock backup create --name "Before update"
moddock backup recover
```

### Important risks and limitations

> [!WARNING]
> A mod or plugin is executable third-party content. ModeDOCK does not audit it for malware, privacy problems, or destructive behavior. Only install files you trust.

- ModeDOCK cannot guarantee compatibility with a game version, mod loader, operating system, or another mod.
- Mods may violate a game's terms or trigger anti-cheat systems. Check the game's rules before using mods, especially in multiplayer.
- A wrong target profile or destination can place files in the wrong directory. Always review the `--dry-run` result or interactive plan.
- `--force` approves destructive operations. Do not use it blindly.
- `--no-backup` is accepted only when no existing file would be overwritten.
- Named snapshots cover managed files, not the entire game installation.
- External changes to managed files or backups produce an integrity error instead of silent deletion. Run `moddock doctor` before forcing recovery.
- Detection is best-effort and may miss portable, custom, or launcher-specific installations.

---

## Data storage

ModeDOCK keeps configuration, profiles, manifests, backups, disabled payloads, logs, and recovery journals outside the npm package:

| Platform | Data directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ModeDOCK` |
| macOS | `~/Library/Application Support/ModeDOCK` |
| Linux | `$XDG_DATA_HOME/moddock` or `~/.local/share/moddock` |

Show the actual paths used by the current installation:

```bash
moddock paths
```

Use `MODDOCK_DATA_DIR`, `--data-dir`, or `--config` when isolated state is needed. Uninstalling the npm package intentionally leaves user data in place for recovery.

---

## Development

```bash
npm run typecheck
npm test
npm run build
npm run verify
npm run test:install
```

The published npm package contains only the bundled CLI, this README, and npm metadata. It has no runtime dependencies; TypeScript, esbuild, and test packages are development dependencies only.

### Documentation

- [`COMMANDS.md`](COMMANDS.md) — complete CLI command reference.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture and internal structure.
- [`docs/ADAPTERS.md`](docs/ADAPTERS.md) — adapter system and extension points.

---

## License

The current `package.json` declares `UNLICENSED`.

Choose and add a real license before accepting outside contributions or publishing the project as open source.

---

<p align="center">
  <a href="#modedock">Back to top</a>
</p>
