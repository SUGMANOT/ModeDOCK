# Launcher integration

## Recommended UI flow

1. Let the user select or detect a game directory.
2. Create a profile with explicit logical destination mappings.
3. Add one or more trusted registries.
4. Call `core.add(..., { dryRun: true })`.
5. Display package changes and every target-relative file operation.
6. Apply the same plan with `core.applyPlan(plan)`.
7. Call `core.verify(profileId)` before launching after external game updates.
8. Surface pending transactions at application startup.

## Minimal service wrapper

```ts
import { ModeDockCore } from "@sugmanot/modedock-core";

export class ModService {
  private constructor(private readonly core: ModeDockCore) {}

  static async open(dataDir: string): Promise<ModService> {
    return new ModService(await ModeDockCore.open({ dataDir }));
  }

  previewInstall(profileId: string, spec: string) {
    return this.core.add(profileId, spec, { dryRun: true });
  }

  apply(plan: Awaited<ReturnType<ModeDockCore["planSync"]>>) {
    return this.core.applyPlan(plan);
  }

  verify(profileId: string) {
    return this.core.verify(profileId);
  }
}
```

## Startup recovery

```ts
const pending = await core.pendingTransactions();
for (const transaction of pending) {
  // Ask the user or follow your product policy.
  await core.recover(transaction.id);
}
```

A launcher should not silently ignore a pending transaction.

## Process separation

For Electron, a local web UI, or an untrusted renderer, keep ModeDOCK Core in the privileged main/backend process. Expose a narrow IPC or HTTP interface with validated profile IDs, package specs, and plan IDs. Do not expose arbitrary filesystem methods to the renderer.

## Plan lifetime

Plans contain filesystem and lockfile preconditions. A plan is intentionally invalidated when:

- another operation changes the profile lockfile;
- a destination file appears, disappears, or changes;
- a symlink or junction is introduced in the destination path.

Generate a new plan instead of forcing a stale one.
