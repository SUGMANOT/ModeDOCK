# Challenge Capsules

Challenge Capsules are portable, declarative challenge contracts. They connect a reproducible package environment with a human task and a result protocol without giving the capsule permission to execute commands or launch a game.

## Why this exists

A modpack describes software. A Challenge Capsule describes an activity around that software:

- which game and loader are compatible;
- which packages are required;
- whether those packages overlay the current profile or temporarily replace it;
- what the participant is expected to do;
- which files should be observed before and after the run;
- which claims must be supplied at completion;
- which metadata a launcher, overlay, bot, or event system may consume.

The same capsule can be used from the ModeDOCK CLI, an Electron/Tauri launcher, a server panel, an OBS helper, or a Discord workflow.

## Trust boundary

A capsule is data, not code. ModeDOCK never:

- executes shell commands from a capsule;
- starts the game;
- loads a plugin into a process;
- follows symbolic links while collecting evidence;
- treats a result bundle as proof of identity or as anti-cheat evidence.

The user or integrating launcher controls process execution. `handoff` is descriptive metadata only.

## Lifecycle

### 1. Inspect

```bash
moddock-core capsule inspect challenge.json --profile coop
```

Inspection validates the schema, computes the capsule SHA-256 integrity value, and optionally checks the capsule against a profile's game, loader, platform, and architecture.

### 2. Prepare

```bash
moddock-core capsule prepare coop challenge.json --dry-run
moddock-core capsule prepare coop challenge.json
```

Preparation resolves the capsule package requirements, produces the same immutable plan used by normal ModeDOCK synchronization, applies it transactionally, and stores the profile's previous direct requirements.

Only one non-restored Challenge Capsule may be active for a profile. This prevents ambiguous nested restores.

Environment modes:

- `overlay`: preserve existing direct requirements and overlay the capsule package ranges;
- `exact`: temporarily replace direct requirements with only the capsule package ranges.

### 3. Arm

```bash
moddock-core capsule arm <session-id> --participant player-name
```

Arming:

1. verifies every managed package file;
2. confirms the profile still has the prepared requirements;
3. snapshots declared evidence paths;
4. calculates an environment fingerprint;
5. issues a session ticket with a random nonce and integrity hash.

After arming, the user starts the game through any mechanism they trust.

### 4. Finish

```bash
moddock-core capsule finish <session-id> \
  --claim score=4200 \
  --claim completed=true \
  --out ./result
```

Finishing snapshots the evidence paths again, copies items declared with `capture: "copy"`, validates claims, verifies that the managed package environment remained stable, and writes `result.json`.

A result verdict is valid when:

- all required evidence paths exist;
- all required claims are present with the declared types;
- the environment is unchanged when `requireStableEnvironment` is enabled.

The result integrity is a canonical SHA-256 hash. It detects modification, but because version 0.2 does not include publisher or participant signatures, it does not establish authorship.

### 5. Restore

```bash
moddock-core capsule restore <session-id>
```

Restore synchronizes the profile back to the direct requirements saved before preparation. Evidence and result bundles remain available.

## Manifest fields

### Identity

```json
{
  "schemaVersion": 1,
  "id": "creator.challenge-id",
  "version": "1.0.0",
  "title": "Challenge title"
}
```

IDs use lowercase letters, numbers, dots, underscores, and hyphens. Versions use SemVer.

### Game compatibility

```json
{
  "game": {
    "id": "example-game",
    "version": ">=1.5.0 <2.0.0",
    "loader": {
      "id": "bepinex",
      "version": "^5.4.0"
    },
    "platforms": ["win32", "linux"],
    "architectures": ["x64"]
  }
}
```

Only `game.id` is required.

### Environment

```json
{
  "environment": {
    "mode": "overlay",
    "packages": {
      "creator.challenge-rules": "^1.0.0",
      "community.visual-pack": "2.4.1"
    }
  }
}
```

Package IDs and ranges are resolved through registries already attached to the selected profile.

### Brief

```json
{
  "brief": {
    "objective": "Complete the first level without healing.",
    "rules": ["No healing items."],
    "notes": ["Start from a new save."],
    "estimatedMinutes": 30,
    "difficulty": "hard"
  }
}
```

Difficulty is one of `casual`, `standard`, `hard`, or `extreme`.

### Evidence

```json
{
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
      }
    ]
  }
}
```

`watch` paths are relative to the game root. Watching `.` is forbidden. Paths are normalized with the same traversal, reserved-name, colon, and trailing-dot protections used by packages.

Capture modes:

- `hash`: record only metadata and SHA-256;
- `copy`: also copy the final file or directory to the result bundle.

Default `maxBytes` is 16 MiB per evidence item. The schema maximum is 256 MiB. Directories are limited to 5,000 regular files. Symbolic links and unsupported filesystem entries are rejected.

Claim types are `string`, `number`, and `boolean`.

### Handoff

```json
{
  "handoff": {
    "label": "Open through your normal launcher",
    "instructions": ["Select the challenge save."],
    "consumerData": {
      "obs-scene": "challenge",
      "launcher-route": "community-event"
    }
  }
}
```

ModeDOCK stores this metadata in the ticket. It never executes it. Consumers decide which keys they support.

## Result format

The result records:

- capsule and ticket integrity;
- participant label, when supplied;
- start and finish timestamps;
- environment fingerprints before and after;
- evidence before/after entries and change flags;
- copied evidence locations;
- submitted claims;
- validity reasons;
- result integrity.

A consumer should validate `result.integrity` before displaying or importing a bundle. Digital signatures are planned separately; do not present the current integrity hash as a trusted signature.

## Creator workflow

```bash
moddock-core capsule init ./event \
  --id community.weekly-event \
  --game example-game \
  --title "Weekly No-Hit Challenge"

moddock-core capsule inspect ./event/challenge.json
```

Add package requirements only after publishing those packages to a registry. Commit the capsule to a repository, host it over HTTPS, or distribute the JSON directly.

## Launcher workflow

Use `core.challenges`:

```ts
const inspection = await core.challenges.inspect(url, profileId);
const prepared = await core.challenges.prepare(profileId, url, { dryRun: false });
const ticket = await core.challenges.arm(prepared.session!.id, { participant });

// Launcher-specific process start happens here, outside ModeDOCK.

const finished = await core.challenges.finish(ticket.sessionId, {
  claims,
  outputDir,
  restore: true
});
```

The API deliberately separates `arm` from process start. This lets launchers ask for user confirmation, use Steam protocol links, start dedicated servers, or hand the ticket to another service without expanding the capsule's authority.
