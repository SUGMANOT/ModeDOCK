# Launcher integration

ModeDOCK Core is intended to run in a privileged backend process. A launcher owns UI, game discovery, authentication, catalog presentation, and process start. ModeDOCK owns package resolution, controlled filesystem convergence, Challenge Capsule state, evidence collection, and restoration.

## Recommended package flow

1. Let the user select or detect a game directory.
2. Create a profile with explicit logical destination mappings.
3. Add one or more trusted registries.
4. Call `core.add(..., { dryRun: true })`.
5. Display package changes and every target-relative file operation.
6. Apply the same plan with `core.applyPlan(plan)`.
7. Call `core.verify(profileId)` before launching after external game updates.
8. Surface pending transactions at application startup.

## Recommended Challenge Capsule flow

1. Call `core.challenges.inspect(source, profileId)`.
2. Display title, objective, rules, package mode, evidence, and compatibility issues.
3. Call `core.challenges.prepare(profileId, source, { dryRun: true })` and display its package plan.
4. After confirmation, call `prepare` without `dryRun`.
5. Call `arm(sessionId, { participant })` immediately before handing control to the launcher.
6. Start the game using launcher-owned code. Never treat capsule handoff metadata as executable input.
7. Call `finish` after the user returns or when an integration knows the run ended.
8. Display the result verdict and let the user export or share the bundle.
9. Call `restore` or set `restore: true` during finish.

## Challenge service wrapper

```ts
import { ModeDockCore } from "@sugmanot/modedock-core";

export class ChallengeService {
  private constructor(private readonly core: ModeDockCore) {}

  static async open(dataDir: string): Promise<ChallengeService> {
    return new ChallengeService(await ModeDockCore.open({ dataDir }));
  }

  inspect(profileId: string, source: string) {
    return this.core.challenges.inspect(source, profileId);
  }

  preview(profileId: string, source: string) {
    return this.core.challenges.prepare(profileId, source, { dryRun: true });
  }

  prepare(profileId: string, source: string) {
    return this.core.challenges.prepare(profileId, source);
  }

  arm(sessionId: string, participant?: string) {
    return this.core.challenges.arm(sessionId, {
      ...(participant ? { participant } : {})
    });
  }

  finish(
    sessionId: string,
    claims: Record<string, string | number | boolean>,
    outputDir: string
  ) {
    return this.core.challenges.finish(sessionId, {
      claims,
      outputDir,
      restore: true
    });
  }
}
```

## UI mapping

Suggested screens:

- **Capsule details:** title, authors, compatibility, objective, rules, duration, package mode, requested evidence.
- **Preparation plan:** packages added/updated/removed, every file operation, download size.
- **Armed session:** ticket ID, participant, environment hash, manual start instructions.
- **Finish form:** claim fields generated from `capsule.evidence.claims`.
- **Result:** validity, reasons, evidence deltas, copied files, result integrity.
- **Recovery:** active sessions and pending package transactions.

## Handoff data

`ticket.handoff` is deliberately inert. A launcher may understand agreed keys such as:

```json
{
  "consumerData": {
    "steam-app-id": "123456",
    "obs-scene": "challenge",
    "server-profile": "weekly-event"
  }
}
```

Do not interpret arbitrary keys as shell commands, executable paths, arguments, URLs, or script bodies. Define a fixed allowlist in the launcher and ask the user before any process start.

## JSON and external tools

The CLI supports `--json`. This is useful for:

- OBS browser-source helpers;
- Discord bots;
- server-control panels;
- CI fixtures;
- desktop launchers that invoke the CLI rather than importing Node.js modules.

Prefer the library API for long-running applications because it avoids parsing process output and provides typed data.

## Startup recovery

```ts
const pending = await core.pendingTransactions();
for (const transaction of pending) {
  // Ask the user or follow your product policy.
  await core.recover(transaction.id);
}

const sessions = await core.challenges.list();
const active = sessions.filter(session => session.status !== "restored");
```

A launcher should not silently ignore a pending package transaction or active challenge session. A completed challenge may still need its previous profile restored.

## Process separation

For Electron, a local web UI, or an untrusted renderer, keep ModeDOCK Core in the privileged main/backend process. Expose a narrow IPC or HTTP interface with validated profile IDs, capsule sources, session IDs, claims, and plan IDs. Do not expose arbitrary filesystem methods to the renderer.

## Plan lifetime

Plans contain filesystem and lockfile preconditions. A plan is intentionally invalidated when:

- another operation changes the profile lockfile;
- a destination file appears, disappears, or changes;
- a symlink or junction is introduced in the destination path.

Generate a new plan instead of forcing a stale one.

## Result trust

`ticket.integrity` and `result.integrity` are tamper-evident SHA-256 values. They are not signatures. A launcher must not describe them as proof of identity, publisher approval, anti-cheat verification, or trusted timing. Future signature support can be layered on top of the canonical formats.
