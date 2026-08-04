# ModeDOCK architecture

## Layers

```text
src/cli/index.ts
  -> direct command handlers or interactive terminal UI
  -> shared AppContext services
  -> core target / installer / backup / diagnostic services
  -> target and format adapter registries
  -> filesystem, JSON configuration, state stores, history, and logger
```

- `src/cli`: startup, parser, output, command handlers, keyboard UI, logo.
- `src/core`: reusable workflows; no terminal rendering.
- `src/adapters/targets`: detection, profile validation, and routing policy.
- `src/adapters/formats`: source expansion into immutable file entries.
- `src/services`: per-user paths, safe filesystem operations, JSON files, and logging.
- `src/types`: public internal contracts shared across layers.

The TUI and direct CLI use the same core service instances. A new command should orchestrate existing services, not reimplement filesystem behavior.

## Installation transaction

1. Resolve and validate the user-selected target.
2. Expand a trusted local source through a format adapter.
3. Normalize every relative path and prove every destination is under the target root.
4. Reject links/junctions, unsupported formats, duplicate installs, and active ownership conflicts.
5. Return an installation plan. Dry-run stops here.
6. Persist a transaction journal.
7. Back up existing destination, atomically copy/write payload, verify SHA-256, and update the journal per file.
8. Persist installation metadata, then remove the journal.
9. On failure, restore prepared originals and remove only verified ModeDOCK payloads in reverse order.

## State ownership

Target application directories contain only files explicitly installed by the user. All ModeDOCK state is stored per user outside the npm package. An installation manifest owns its target-relative paths while active. Unmanaged existing files are never claimed without a backup. Modified files are not silently deleted.

## Extension points

Target adapters own detection, defaults, validation, and routing. Format adapters turn a source into entries containing relative path, size, SHA-256, and source bytes/path. The installer owns all writes, backups, integrity checks, and rollback, so adapters cannot bypass safety policy.
