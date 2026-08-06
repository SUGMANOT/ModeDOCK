# Architecture

## Product boundary

ModeDOCK Core owns package resolution, controlled filesystem convergence, and the Challenge Capsule protocol. It does not own catalog discovery, authentication, ratings, moderation, game launching, process modification, or gameplay inspection.

```text
Desktop app / launcher / server panel / CLI
                    │
                    ▼
              ModeDockCore
       ┌────────────┼─────────────────────┐
       ▼            ▼                     ▼
 package graph  transaction engine   Challenge Manager
       │            │              ┌──────┼────────┐
       ▼            ▼              ▼      ▼        ▼
 static registry  game files     ticket evidence result
                    │                        │
                    └──────────────┬─────────┘
                                   ▼
                          validated state store
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

A Challenge Session stores:

- the validated capsule and capsule integrity;
- previous and effective direct requirements;
- lifecycle state;
- evidence baseline;
- session ticket;
- result location;
- restoration state.

Only one non-restored challenge session is permitted per profile. This makes restoration deterministic and prevents nested challenges from overwriting each other's previous requirements.

## Package synchronization

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

## Challenge lifecycle

### Inspect

A local, `file://`, HTTP, or HTTPS capsule resource is parsed and runtime-validated. Compatibility can be checked against a selected profile. The integrity value is SHA-256 over canonical validated data.

### Prepare

The capsule environment is converted into direct package requirements:

- overlay mode merges existing requirements with capsule requirements;
- exact mode uses only capsule requirements.

A normal immutable synchronization plan is built and applied. The previous requirements are stored before mutation.

### Arm

The manager verifies all lockfile-owned files, snapshots declared evidence paths, computes an environment fingerprint, and issues a ticket. The ticket contains objective, rules, handoff metadata, nonce, environment hash, evidence-baseline hash, and ticket integrity.

No process is started. This is an explicit architecture boundary.

### Finish

Evidence paths are inspected again. Regular files are hashed; directories are represented by a sorted list of relative paths, sizes, and file hashes. Optional copying uses only declared paths and size limits. Claims are runtime-validated against capsule definitions.

A result verdict combines:

- required evidence presence;
- required claim presence;
- managed environment stability.

### Restore

The package planner converges the profile back to the stored previous direct requirements. It uses the same transaction engine and safety checks as every other package operation.

## Evidence safety

Evidence collection:

- accepts only safe paths relative to the game root;
- forbids watching the game root itself;
- rejects traversal, colons, Windows reserved names, and trailing dots/spaces;
- rejects symbolic links and unsupported filesystem entry types;
- enforces per-rule byte limits;
- limits directory traversal to 5,000 regular files;
- requires result output to be outside the game root.

ModeDOCK does not read process memory, capture network traffic, install hooks, or infer gameplay state.

## Trust model

The core treats registries, packages, capsules, state files, claims, and evidence paths as untrusted data:

- JSON is runtime-validated;
- package and evidence paths are normalized;
- files cannot escape allowed roots;
- package manifests and capsules cannot execute code;
- descriptor and artifact hashes are verified;
- destination changes after planning invalidate the plan;
- ticket and result documents carry canonical integrity hashes.

A registry can still distribute malicious DLLs or game data. SHA-256 proves identity, not safety. A result hash detects modification but does not prove who produced the result.

## Extension points

The intended public extension points are:

- custom UI around `ModeDockCore`;
- custom registry hosting and generation;
- declarative destination maps per game;
- Challenge Capsule catalogs and event systems;
- fixed, allowlisted interpretation of `handoff.consumerData`;
- result consumers such as overlays, bots, dashboards, and server panels;
- future signing and deployment backends.

Arbitrary JavaScript adapters and capsule scripts are intentionally absent because loading them would grant full Node.js privileges.
