# Installation

## Requirements

- Node.js 20+
- npm

## Source installation

```bash
git clone https://github.com/SUGMANOT/ModeDOCK.git
cd ModeDOCK
npm ci
npm run verify
npm run dev
```

## Windows installer

Use the included PowerShell installer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The installer prepares a local runtime, builds the project and installs the command shim.

## Verify installation

```bash
moddock --version
moddock doctor
```
