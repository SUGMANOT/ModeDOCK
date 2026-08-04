# Runtime compatibility architecture

Runtime work is isolated from the existing transactional file-management core.

```text
CLI/TUI
  -> runtime inspection/orchestration services (TypeScript)
  -> isolated native/managed helpers
  -> explicit allowlisted GameAdapter launch plans

File manager
  -> existing plans, journals, SHA-256, backups, rollback
```

Stage 1 adds a metadata-only PE inspector. It reads bytes and PE data directories directly and never calls platform library-loading APIs. Static inspection reports format, architecture, CLR presence, imported DLLs, exports, SHA-256, Authenticode directory presence, known managed-reference signals, and the ModeDOCK N1 export surface.

Stage 2 adds a Windows x64 C helper for explicit N1 calls. The CLI first performs static validation and architecture checks, then spawns the helper with bounded time/output. The helper owns a restrictive Job Object, cannot create child processes under its active-process limit, and contains a plugin crash to its own process. There is no PID parameter and no attachment to an existing process.

Stage 3 adds a separate C# metadata helper. It uses `PEReader` and `MetadataReader`; it never uses `Assembly.Load`, reflection activation, or plugin constructors. Its report contains exact assembly identity/references, BepInPlugin attributes, dependency constraints, BaseUnityPlugin inheritance, Harmony attributes, and explainable unsupported symbols. The packaged helper is framework-dependent and currently requires the optional .NET 10 runtime; file management and native inspection still require only Node.js.

Stage 4 adds a metadata-first B1 planner and an experimental B2 controlled host. The planner rejects invalid metadata, duplicate GUIDs, missing hard dependencies, incompatibilities and dependency cycles, and filters `BepInProcess` before execution. The host uses ModeDOCK-owned `BepInEx.dll` and `UnityEngine.dll` compatibility shims, constructs a persistent manager object, initializes `Info`, `Logger`, `Config` and `Paths` before `Awake`, and returns structured results even when one plugin throws. This host is a test harness; it is not yet a launch-time bootstrap inside a real Unity game.

Stage 5 added the ModeDOCK-owned `0Harmony.dll` H1 surface and an H2 cooperative dispatcher. Patch registration, parameter binding, ordering and owner unpatch are tested in a separate process. Methods must currently opt into `HarmonyRuntime`; direct arbitrary managed methods are not detoured. At that stage Finalizer and Transpiler requests failed explicitly until the controlled Stage 7 implementation was added.

Stage 6 adds `sample-unity-mono@1.0.0`, an allowlisted controlled GameAdapter. It verifies the fixture marker, executable SHA-256, x64 architecture, managed directory and `Assembly-CSharp.dll`. Bootstrap assets are installed and removed through the existing transaction/backup engine. Launch creates a new child from the configured executable and loads only enabled DLLs recorded for the selected profile; no PID or attach path exists. This proves adapter, bootstrap, doctor and rollback integration without claiming support for a commercial game.

Stage 7 extends the cooperative Harmony backend with H3 Finalizers and a controlled H4 IL pipeline. H3 guarantees Finalizer execution and supports exception replacement/suppression. H4 chains transpilers, tracks labels/exception blocks, verifies stack merges, emits a new `DynamicMethod`, and records original/final IL plus owners. The plugin planner continues to reject Transpiler for arbitrary game plugins because the controlled compiler is not a universal Mono detour.

## Current compatibility matrix

| Area | Level | Status | Evidence |
| --- | --- | --- | --- |
| Native ABI | N1 static + isolated probe | experimental | immutable fixture, timeout/crash, packaged-helper tests |
| Managed classification | B0 | implemented metadata inspection; runtime compatibility partial | synthetic BepInEx/Harmony fixture |
| BepInEx loading | B1/B2 | experimental controlled harness only | dependency, config/logging, lifecycle and failure-isolation tests |
| Harmony | H1-H4 cooperative | experimental controlled harness; no arbitrary detours | dispatch, finalizer, IL chain/verification/regeneration tests |
| Game bootstrap | controlled adapter | experimental allowlisted fixture only | transactional install/launch/doctor/uninstall integration test |

“Partial” means the report is evidence-based but does not claim runtime compatibility. Unknown games and versions remain unsupported.
