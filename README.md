<div align="center">

<picture>
  <img width="1143" height="359" alt="modedock-logo-light" src="https://github.com/user-attachments/assets/ea0eb3a5-4a7e-4e35-80a2-e0fb76c84454" />
</picture>

**A safety-first terminal manager for local game mods and plugins.**

Manage user-selected mod files through an interactive terminal interface or a scriptable CLI, with installation previews, backups, transaction recovery, and SHA-256 integrity checks.

[![Project status](https://img.shields.io/badge/status-beta-f59e0b?style=for-the-badge)](https://github.com/SUGMANOT/ModeDOCK)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2563eb?style=for-the-badge)](#requirements)
[![License](https://img.shields.io/badge/license-MIT-111827?style=for-the-badge)](LICENSE)

[Repository](https://github.com/SUGMANOT/ModeDOCK) · [Releases](https://github.com/SUGMANOT/ModeDOCK/releases) · [Issues](https://github.com/SUGMANOT/ModeDOCK/issues) · [License](LICENSE)

</div>

---

## Overview

ModeDOCK manages local files that the user explicitly selects. It combines reusable game profiles, loader-aware file routing, installation planning, backups, transaction journals, integrity verification, and recovery tools in one terminal application.

The interactive interface and direct CLI commands use the same core services. Changing the interface language does not change command names, so scripts remain compatible.

> [!IMPORTANT]
> ModeDOCK does not download mods, install mod loaders, inject code into running processes, attach to arbitrary process IDs, bypass DRM, or bypass anti-cheat software.

## Navigation

[Features](#features) · [Supported integrations](#supported-integrations) · [Installation](#installation) · [Quick start](#quick-start) · [Commands](#command-examples) · [DLL inspection](#static-dll-inspection) · [Runtime](#experimental-runtime-compatibility) · [Settings](#settings) · [Safety](#safety-model) · [Development](#development)

---

## Features

| Function | Description |
| --- | --- |
| **Game profiles** | Creates and stores separate profiles for different games or applications. |
| **Folder-based setup** | Creates a profile from a selected installation directory. |
| **Automatic profile inference** | Suggests a profile name, likely executable, detected loader, and common mod directories. |
| **Steam and Epic discovery** | Detects supported installations from launcher manifests without listing unrelated applications. |
| **Integration re-scan** | Re-checks a profile after a mod loader or directory structure changes. |
| **Local file installation** | Installs a user-selected file, folder, or ZIP archive. |
| **Dry-run preview** | Shows every planned destination and change before writing files. |
| **Loader-aware routing** | Routes compatible files to the game root, `Mods`, `Plugins`, `Config`, or a detected loader directory. |
| **Archive normalization** | Recognizes supported directory structures inside archives and prevents duplicated paths. |
| **Managed item list** | Displays files and packages installed through ModeDOCK. |
| **Enable and disable** | Temporarily disables managed items without permanently deleting them. |
| **Reinstall and remove** | Reinstalls or removes managed items using recorded ownership information. |
| **Automatic backups** | Backs up existing files before replacement and restores originals during removal when possible. |
| **Named snapshots** | Creates user-named recovery points for managed files. |
| **Transaction recovery** | Uses journals to roll back failed multi-file operations and recover interrupted installations. |
| **SHA-256 verification** | Detects modified managed files, backup changes, and ownership conflicts. |
| **Diagnostics** | Checks profiles, files, backups, and recovery state with `moddock doctor`. |
| **JSON output** | Produces machine-readable results for scripts and automation through `--json`. |
| **Interactive terminal UI** | Provides keyboard-driven navigation for normal daily use. |
| **English and Russian UI** | Changes interface language without changing CLI command names. |
| **Interface themes** | Supports default cyan, monochrome, and amber themes. |
| **Logo styles** | Supports full and compact terminal branding. |
| **Static DLL inspection** | Reads PE and managed metadata without loading the inspected library. |
| **Restricted native probing** | Runs explicitly requested N1 metadata and self-test exports in an isolated Windows helper. |
| **Managed plugin inspection** | Reads assembly references and plugin attributes without executing plugin code. |
| **Adapter-gated runtime tools** | Enables experimental runtime workflows only for explicitly supported game adapters. |
| **Custom data locations** | Supports isolated configuration and state through environment variables and CLI options. |

---

## Supported integrations

ModeDOCK recognizes an already installed loader and routes compatible files to its conventional directory.

| Integration | Default destination |
| --- | --- |
| **BepInEx** | `BepInEx/plugins` |
| **MelonLoader** | `Mods` or `Plugins` |
| **UE4SS** | Adjacent `Mods` directory |
| **REFramework** | `reframework/plugins` |
| **Unreal Engine pak layout** | `Content/Paks/~mods` |

If a loader is installed or changed after profile creation, open **Profiles → Re-scan game integration**.

This is file-level loader integration. It is not arbitrary process injection.

---

## Requirements

| Component | Requirement |
| --- | --- |
| [Node.js](https://nodejs.org/) | Version 20 or newer |
| npm | Required |
| Operating system | Windows, macOS, or Linux |

Steam and Epic discovery depend on the operating system and launcher installation. Folder-based profiles work everywhere Node.js is supported.

---

## Installation

### Windows installer

Clone the repository and open PowerShell in its root:

```powershell
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The installer:

1. Reuses a compatible local Node.js installation when available.
2. Otherwise downloads an official portable Node.js LTS ZIP.
3. Verifies the published SHA-256 checksum.
4. Stores the portable runtime under `%LOCALAPPDATA%\ModeDOCK\runtime`.
5. Builds and tests ModeDOCK.
6. Installs ModeDOCK under `%LOCALAPPDATA%\ModeDOCK`.
7. Adds its command shim to the beginning of the user `PATH`.

Open a new terminal after installation:

```powershell
moddock
```

Use `-KeepBuildFiles` to preserve `node_modules` and `dist` in the source folder.

### Run from source

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm ci
npm run verify
npm run dev
```

`npm run dev` builds ModeDOCK and opens the interactive interface.

### Test as a global command

```bash
npm pack
npm install -g ./moddock-1.0.0-beta.0.tgz
moddock --version
moddock
```

The npm package name should not be presented as publicly available until package ownership and publishing are verified.

---

## Quick start

### Interactive interface

Start ModeDOCK:

```bash
moddock
```

| Key | Action |
| --- | --- |
| `Up` / `Down` | Move through menu items. |
| `Enter` | Select the current item. |
| `Escape` | Return to the previous screen. |

Basic workflow:

1. Open **Profiles**.
2. Select **Add game from folder**.
3. Enter the game installation directory.
4. Review the inferred executable and detected integration.
5. Create the profile.
6. Select **Install a mod or plugin**.
7. Review every planned destination.
8. Confirm the installation.

ModeDOCK shows the complete file plan before applying changes.

### Direct CLI workflow

```bash
moddock target add --root "C:\Games\Example"
moddock install ./plugin.dll --dry-run
moddock install ./plugin.dll
moddock list
moddock disable plugin
moddock enable plugin
moddock remove plugin
moddock doctor
```

Run `moddock --help` to display the complete command list.

---

## Command examples

### Profiles and managed items

| Command | Purpose |
| --- | --- |
| `moddock target add --root <path>` | Creates a game profile from an installation directory. |
| `moddock list` | Lists items managed for the active profile. |
| `moddock install <path>` | Installs a local file, folder, or ZIP archive. |
| `moddock install <path> --dry-run` | Previews destinations without changing files. |
| `moddock disable <item>` | Moves a managed item into disabled storage. |
| `moddock enable <item>` | Restores a disabled managed item. |
| `moddock reinstall <item>` | Reinstalls a managed item from its recorded source. |
| `moddock remove <item>` | Removes an item and restores backed-up originals when available. |
| `moddock doctor` | Checks integrity, ownership, backups, and recovery state. |

### Backups and recovery

```bash
moddock backup create --name "Before update"
moddock backup recover
```

| Command | Purpose |
| --- | --- |
| `backup create` | Creates a named snapshot of managed files. |
| `backup recover` | Attempts to recover an interrupted or damaged managed state. |

### Data paths

```bash
moddock paths
```

This displays the directories used for configuration, profiles, manifests, backups, disabled payloads, logs, and recovery journals.

---

## Static DLL inspection

ModeDOCK includes an experimental compatibility-analysis foundation for native and managed plugin files.

### Inspect without loading

```bash
moddock dll inspect "C:\path\plugin.dll"
moddock dll inspect "C:\path\plugin.dll" --json
```

The inspector treats the DLL as data. It can report:

- PE32 or PE32+ format;
- target architecture;
- native or managed classification;
- CLR header presence;
- imported DLLs;
- exported functions;
- SHA-256 hash;
- signature-directory presence;
- known BepInEx, Harmony, and Unity reference signals;
- the static Native ABI N1 export surface.

It does not load the library, execute `DllMain`, or call exported functions.

### Restricted N1 probe

```bash
moddock dll probe "C:\path\plugin.dll" --execute-probe
```

The probe runs only N1 metadata and self-test exports in a separate restricted Windows helper with timeout and crash isolation.

It does not accept a process ID, attach to a running game, or inject the plugin. Non-interactive execution requires both `--execute-probe` and `--force`.

### Generate a local manifest

```powershell
moddock dll manifest "C:\path\plugin.dll" --json
```

This creates a local schema-v1 manifest without executing the N1 DLL.

### Inspect a managed plugin

```bash
moddock plugin inspect "C:\path\ManagedPlugin.dll" --json
moddock plugin compatibility "C:\path\ManagedPlugin.dll"
```

These commands report exact assembly references and plugin attributes without loading plugin code. The packaged managed helper currently requires the optional .NET 10 runtime. File management and native inspection remain independent of .NET.

---

## Experimental runtime compatibility

> [!WARNING]
> The runtime layer is adapter-gated and experimental. It is not a general injector and does not claim compatibility with arbitrary commercial games.

### Compatibility levels

| Level | Scope |
| --- | --- |
| **N1** | Static native inspection and restricted metadata or self-test probing. |
| **B0** | Metadata-only managed plugin classification. |
| **B2** | Experimental managed plugin loading inside a controlled .NET harness. |
| **H1-H4** | Cooperative Harmony-style behavior tested against controlled static methods. |

<details>
<summary><strong>Controlled harness coverage</strong></summary>

- **H2:** registry behavior, patch ordering, owner unpatch, argument and special-parameter binding, and skip-original semantics.
- **H3:** guaranteed Finalizer execution plus exception replacement and suppression.
- **H4:** chained `CodeInstruction` transforms, labels, exception blocks, stack validation, dynamic regeneration, and diagnostics.

These levels do not mean ModeDOCK detours arbitrary game methods.

</details>

### Runtime commands

```powershell
moddock runtime status <target> --json
moddock runtime install <target> --dry-run
moddock runtime install <target>
moddock runtime doctor <target>
moddock launch <target> --profile <profile>
moddock runtime uninstall <target> --dry-run
moddock runtime uninstall <target> --force
```

| Command | Purpose |
| --- | --- |
| `runtime status` | Reports adapter and runtime state for a target. |
| `runtime install --dry-run` | Previews adapter-controlled runtime installation. |
| `runtime install` | Installs the supported runtime bootstrap. |
| `runtime doctor` | Diagnoses the target runtime integration. |
| `launch` | Launches a supported target with a selected runtime profile. |
| `runtime uninstall --dry-run` | Previews runtime removal. |
| `runtime uninstall --force` | Performs explicitly approved runtime removal. |

The current beta supports only the controlled `sample-unity-mono` test target. The adapter validates a marker, exact executable SHA-256, x64 architecture, managed directory, and `Assembly-CSharp.dll`.

Unknown games and versions return `GAME_RUNTIME_UNSUPPORTED`. There is no PID argument, running-process attachment, or general-purpose injector.

Runtime bootstrap installation writes `.moddock/runtime-lock.json` with the adapter, game hash, and tested `B2/H2/N1` launch compatibility. H3 and H4 remain controlled-harness capabilities and are not advertised in the game launch lockfile.

---

## Settings

Open **Settings** in the interactive interface to change:

- interface language;
- color theme;
- logo style;
- automatic backups;
- removal confirmations.

Changes are saved and rendered immediately. English is the default language.

Settings can also be managed from the shell:

```bash
moddock config list
moddock config set language ru
moddock config set theme amber
moddock config set logoStyle compact
moddock config reset --force
```

| Setting | Supported values |
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

Useful safety commands:

```bash
moddock install ./mod.zip --dry-run
moddock doctor
moddock backup create --name "Before update"
moddock backup recover
```

### Risks and limitations

> [!WARNING]
> A mod or plugin is executable third-party content. ModeDOCK does not audit it for malware, privacy violations, or destructive behavior. Install only files you trust.

- ModeDOCK cannot guarantee compatibility with a game version, loader, operating system, or another mod.
- Mods may violate a game's terms or trigger anti-cheat systems, especially in multiplayer.
- An incorrect profile or destination can place files in the wrong directory.
- `--force` approves destructive operations and should not be used blindly.
- `--no-backup` is accepted only when no existing file would be overwritten.
- Named snapshots cover managed files, not the entire game installation.
- External changes to managed files or backups produce an integrity error instead of silent deletion.
- Detection and executable inference are best-effort and may require an override such as `--exe`.

Always review the interactive plan or `--dry-run` output before installation. Run `moddock doctor` before forcing recovery.

---

## Data storage

ModeDOCK stores configuration and recovery data outside the npm package.

| Platform | Default location |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ModeDOCK` |
| macOS | `~/Library/Application Support/ModeDOCK` |
| Linux | `$XDG_DATA_HOME/moddock` or `~/.local/share/moddock` |

Stored data can include configuration, profiles, manifests, backups, named snapshots, disabled payloads, logs, and transaction journals.

Show the active paths:

```bash
moddock paths
```

Use `MODDOCK_DATA_DIR`, `--data-dir`, or `--config` when isolated state is required. Uninstalling the npm package intentionally leaves user data in place for recovery.

---

## Development

```bash
npm run build:all
npm run typecheck
npm test
npm run build
npm run test:tui
npm run verify
npm run test:install
npm run verify:release
```

| Command | Purpose |
| --- | --- |
| `npm run build:all` | Builds the native probe, managed helpers and fixtures, and the TypeScript CLI. |
| `npm run typecheck` | Runs TypeScript type checking. |
| `npm test` | Runs the main automated test suite. |
| `npm run build` | Builds the TypeScript application. |
| `npm run test:tui` | Tests the interactive terminal interface. |
| `npm run verify` | Runs the standard project verification workflow. |
| `npm run test:install` | Tests the installation workflow. |
| `npm run verify:release` | Runs release-specific verification checks. |

`npm run build:all` requires the .NET 10 SDK. If `zig.exe` is unavailable, the Windows build downloads the pinned Zig 0.16.0 archive, verifies its SHA-256 checksum, uses it for that build, and removes it afterward.

The packaged artifact contains the bundled CLI, native and managed runtime helpers, the public ABI header, documentation, and npm metadata. It has zero npm runtime dependencies.

---

## Repository links

| Resource | Link |
| --- | --- |
| Source code | [github.com/SUGMANOT/ModeDOCK](https://github.com/SUGMANOT/ModeDOCK) |
| Releases | [GitHub Releases](https://github.com/SUGMANOT/ModeDOCK/releases) |
| Bug reports and requests | [GitHub Issues](https://github.com/SUGMANOT/ModeDOCK/issues) |
| Commit history | [GitHub Commits](https://github.com/SUGMANOT/ModeDOCK/commits/main) |
| License file | [LICENSE](LICENSE) |

---

## License

The repository contains an [MIT License](LICENSE).

Before publishing the npm package, ensure that the `license` field in `package.json` is also set to `MIT` rather than `UNLICENSED`.

<div align="right">

[Back to top](#modedock)

</div>
