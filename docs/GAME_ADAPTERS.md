# Game adapters and launch-time bootstrap

ModeDOCK runtime execution is gated by a versioned `GameAdapter`. File installation remains available for ordinary profiles, but runtime install and launch stop with `GAME_RUNTIME_UNSUPPORTED` unless an adapter recognizes the exact installation and version.

## Current adapter

`sample-unity-mono@1.0.0` supports only the controlled integration fixture built from this repository. It requires:

- marker ID `modedock.controlled-unity-mono.v1` and game version `1.0.0-test`;
- an exact SHA-256 match between the marker and the fixture executable;
- an x64 PE executable;
- `ModeDOCK.SampleUnityMonoGame_Data/Managed/Assembly-CSharp.dll`;
- protection status `not-applicable`.

This is a deterministic CI/integration target, not a claim of support for a commercial Unity game.

## Bootstrap and launch

The adapter produces an exact file plan under `.moddock/runtime`. ModeDOCK applies it through the same transaction journal, SHA-256 verification, backup and rollback engine used by ordinary installations. PDB files are excluded from the published runtime. Uninstall uses the recorded installation and restores any prior files.

Launch starts only the profile's configured executable as a new child process. The runtime plan path is passed through a launch-time environment variable. The adapter never accepts a PID and never attaches to an already-running process. Only enabled managed DLLs recorded for the selected target profile are inspected, dependency-ordered and included in the plan.

`moddock runtime doctor` checks the adapter/version, executable architecture and hash, engine/runtime marker, protection status, bootstrap integrity, write access, plugin dependency graph, unsupported Harmony symbols and config syntax.

## Known limitations

- The target is a controlled Unity-Mono-shaped harness, not the actual Unity Mono runtime.
- Harmony H2 methods are cooperatively routed in the controlled harness; arbitrary method detours are not implemented.
- Unknown protection state or unknown game/version is never auto-approved.
- Runtime helpers currently require the optional .NET 10 runtime on Windows x64.
