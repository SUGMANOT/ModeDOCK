[README.md](https://github.com/user-attachments/files/30674633/README.md)
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/modedock-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/modedock-logo-light.png">
    <img src="./assets/modedock-logo-light.png" width="720" alt="ModeDOCK">
  </picture>
</p>

<h1 align="center">ModeDOCK</h1>

<p align="center">
  A lightweight, modular Windows CLI for managing DLL and ZIP game mods.
</p>

<p align="center">
  <a href="#-installation">Installation</a> ·
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-commands">Commands</a> ·
  <a href="#-development">Development</a> ·
  <a href="#-security">Security</a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933">
  <img alt=".NET" src="https://img.shields.io/badge/.NET-10-512BD4">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Status" src="https://img.shields.io/badge/status-active%20development-orange">
</p>

---

> [!IMPORTANT]
> ModeDOCK is a **file manager for game modifications**. It is not a DLL injector, mod loader, compatibility layer, or mod downloader. DLL mods still require the loader and game version specified by their authors, such as BepInEx or MelonLoader.

> [!WARNING]
> Always back up important game files and install mods only from sources you trust. A third-party DLL can execute arbitrary code after a compatible game loader loads it.

> [!CAUTION]
> SHA-256 checks can detect whether managed files were changed. They cannot prove that a mod is safe, authentic, or compatible with your game.

## 📌 About

ModeDOCK is a local Windows x64 command-line manager for `.dll` and `.zip` game mods. It stores reusable game profiles, installs files into controlled relative paths, tracks every managed file, creates backups, and supports safe disable, enable, and uninstall operations.

ModeDOCK never edits the contents of an archive or DLL, injects code, downloads mods, or decides whether a mod is compatible with a particular game.

## ✨ Features

- Reusable game profiles with a display name, game directory, executable, and default mod target.
- Installation of a single `.dll` file or the contents of a `.zip` archive.
- JSON manifests containing every installed file and its SHA-256 digest.
- Automatic backups before existing files are replaced.
- Safe mod disabling by moving managed files outside the game and restoring originals.
- Re-enabling only when destination paths remain safe.
- Clean uninstall with restoration of original files.
- Detection of missing or modified managed files.
- Protection against absolute paths, parent-path traversal, unsafe ZIP entries, and ownership conflicts.
- Launching a configured game directly from the terminal.

## 📦 Installation

> [!NOTE]
> The npm command below becomes available after the package is published under the `moddock` name. The README assumes that the project, package metadata, executable shim, namespaces, and commands have all been renamed from ModForge to ModeDOCK.

Install ModeDOCK globally:

```powershell
npm install -g moddock
```

Verify the installation:

```powershell
moddock --version
moddock --help
```

The npm package installs the `moddock` command. The native .NET CLI is self-contained, so end users need Node.js/npm but do not need to install the .NET runtime separately.

**Current platform support:** Windows x64.

### Install the current checkout for testing

```powershell
npm run build
npm pack --ignore-scripts --pack-destination dist
npm install -g .
moddock doctor
```

During development, `npm install -g .` creates a junction to the current checkout rather than a fully standalone installation.

### Uninstall

```powershell
npm uninstall -g moddock
```

## 🚀 Quick start

### 1. Register a game profile

```powershell
moddock profile add `
  --name "Cuphead" `
  --game-dir "C:\Games\Cuphead" `
  --exe "Cuphead.exe" `
  --target "BepInEx/plugins"
```

The executable must exist inside the selected game directory.

### 2. Install and inspect a mod

```powershell
moddock mod install "C:\Downloads\ExampleMod.zip" --profile "Cuphead"
moddock mod list --profile "Cuphead"
moddock doctor --profile "Cuphead"
```

### 3. Disable, enable, or uninstall it

```powershell
moddock mod disable "ExampleMod" --profile "Cuphead"
moddock mod enable "ExampleMod" --profile "Cuphead"
moddock mod uninstall "ExampleMod" --profile "Cuphead"
```

A mod may be selected by its name, full ID, or an unambiguous ID prefix. When only one profile exists, the `--profile` option may be omitted.

## 🛠 Commands

```text
moddock --help
moddock --version
moddock doctor [--profile <name>]
moddock paths

moddock profile add [options]
moddock profile list
moddock profile show <profile>
moddock profile remove <profile>

moddock mod install <file> [--profile <name>]
moddock mod list [--profile <name>]
moddock mod disable <mod> [--profile <name>]
moddock mod enable <mod> [--profile <name>]
moddock mod uninstall <mod> [--profile <name>]
```

See [`COMMANDS.md`](COMMANDS.md) for the complete command reference, options, aliases, output modes, and exit codes.

## 💾 Storage

ModeDOCK stores its local state in a per-user application directory. After the internal rename is completed, the intended location is:

```text
%LOCALAPPDATA%\ModeDOCK\
├── profiles.json
├── manifests/<profile-id>/<mod-id>.json
├── backups/<profile-id>/<mod-id>/...
└── disabled/<profile-id>/<mod-id>/...
```

Use the following command to print the exact active paths:

```powershell
moddock paths
```

For isolated automation or tests, use `MODDOCK_DATA_DIR` or pass `--data-dir <path>` after the variable and option names have been implemented in the renamed codebase.

> [!WARNING]
> Do not manually delete backup, disabled, or manifest files while mods are installed. They are required for safe restoration and lifecycle tracking.

## 🧱 Project structure

```text
ModeDOCK.Core/             Platform-neutral models, storage, validation, and mod engine
ModeDOCK.Cli/              Dependency-free native CLI and command modules
ModeDOCK.Core.Tests/       Core lifecycle and safety tests
bin/moddock.js             Minimal npm executable shim
scripts/                   Release build and packaged-CLI tests
docs/                      Architecture and extension notes
```

The dependency direction is one-way:

```text
ModeDOCK.Cli → ModeDOCK.Core
npm shim    → packaged native CLI
```

The CLI layer should contain command parsing and presentation only. File safety, profiles, manifests, installation logic, backup handling, and validation belong in the core layer.

## 🧪 Development

### Requirements

- Windows x64
- .NET 10 SDK
- Node.js 18 or newer
- npm

### Common tasks

```powershell
dotnet build ModeDOCK.slnx -c Release
npm run dev:cli -- --help
npm run test:core
npm run build
npm run test:cli
npm run test:install
npm pack --dry-run
```

`npm run build` creates a compressed, self-contained executable in `dist/win-x64`.

`npm test` expects the release executable to exist. `npm run test:install` packs and installs ModeDOCK into an isolated temporary global prefix. `npm pack` should build and test automatically through `prepack`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for invariants and extension points, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow.

## 📤 Publishing to npm

Before the first public release:

1. Confirm that the npm package name `moddock` is available.
2. Set `"name": "moddock"` and `"license": "MIT"` in `package.json`.
3. Configure the `bin` field so the global executable is `moddock`.
4. Add the real `repository`, `bugs`, `homepage`, and author metadata.
5. Keep the .NET and npm package versions identical.
6. Run all tests and inspect the package contents.
7. Authenticate with npm and publish.

```powershell
npm test
npm pack --dry-run
npm login
npm publish
```

For every later release, update both version sources, rebuild, test, pack, and publish.

## 🔒 Security

ModeDOCK protects its own file operations by validating destinations, tracking ownership, rejecting unsafe archive paths, creating backups, and checking managed files with SHA-256.

These protections do not make third-party mods trustworthy. A compatible game loader may execute DLL code with the permissions of the current user.

Use only trusted sources, verify release information, and inspect unexpected antivirus detections before excluding any file from protection.

## 📄 License

ModeDOCK is distributed under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions should preserve the safety rules of the core engine and keep the npm layer lightweight. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting changes.

---

<p align="center">
  <strong>ModeDOCK</strong><br>
  Lightweight mod lifecycle management from the terminal.
</p>
