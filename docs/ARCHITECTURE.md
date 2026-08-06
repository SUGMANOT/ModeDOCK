# Architecture

## Product boundary

ModeDOCK Core owns package resolution and controlled filesystem convergence. It does not own discovery UI, authentication, package ratings, community moderation, game launching, or process modification.

```text
Desktop app / launcher / server panel / CLI
                    │
                    ▼
              ModeDockCore
       ┌────────────┼────────────┐
       ▼            ▼            ▼
 dependency     sync planner   verifier
 resolver           │
       │             ▼
 static registry transaction executor
                     │
                     ▼
          game directory + state store
```

## Source of truth

A profile document stores:

- the game environment;
- logical destination mappings;
- direct package requirements;
- registry references.

A lockfile stores:

- exact resolved package versions;
- package integrity values;
- exact artifacts and destination paths;
- current file ownership;
- hashes of managed files;
- verified backups of files that existed before ModeDOCK claimed them.

The profile expresses intent. The lockfile expresses the exact applied state.

## Synchronization

1. Read and validate the profile and current lockfile.
2. Resolve direct and transitive dependencies.
3. Map package file rules through the profile destination map.
4. Reject ownership collisions.
5. Inspect every current destination and original backup.
6. Build a plan containing explicit filesystem preconditions.
7. Acquire the profile mutex.
8. Confirm the lockfile has not changed since planning.
9. Recheck every precondition and nested path component.
10. Download all changed artifacts into transaction staging.
11. Verify size and SHA-256.
12. Write a transaction journal.
13. Snapshot each destination immediately before mutation.
14. Apply writes, removals, and original restorations.
15. Persist the new lockfile and profile.
16. Mark the journal applied and remove transaction data.

If any step after journaling fails, files, lockfile, and profile are restored in reverse order.

## Trust model

The core treats registries and packages as untrusted data:

- JSON is runtime-validated;
- package paths are normalized;
- files cannot escape the game root;
- package manifests cannot execute code;
- descriptor and artifact hashes are verified;
- destination changes after planning invalidate the plan.

A registry can still distribute malicious DLLs or game data. SHA-256 proves identity, not safety. Launcher integrations should display publisher identity and origin once signing is implemented.

## Extension points

The intended public extension points are:

- custom UI around `ModeDockCore`;
- custom registry hosting and generation;
- declarative destination maps per game;
- future resolver policies;
- future filesystem deployment backends.

Arbitrary JavaScript adapters are intentionally absent from the core because loading them would grant full Node.js privileges.
