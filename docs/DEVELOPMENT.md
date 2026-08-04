# Development

## Setup

```bash
npm ci
```

## Checks

```bash
npm run typecheck
npm test
npm run verify
```

## Build

```bash
npm run build:all
```

## Structure

- `src/cli` — commands and terminal UI
- `src/core` — shared workflows
- `src/adapters` — integration points
- `src/services` — storage and filesystem services

Changes should keep safety checks inside core services instead of duplicating them in adapters or commands.
