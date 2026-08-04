# BepInEx compatibility

Current tested level: **experimental B2 in the controlled ModeDOCK harness; real-game compatibility remains partial**.

`ModeDOCK.ManagedInspector.exe` uses `System.Reflection.Metadata`/`PEReader` and never loads the inspected assembly. A TypeScript planner validates metadata, process filters, duplicate GUIDs, hard/soft dependencies, incompatibilities and cycles before it creates an ordered plan. Only then can the separate `ModeDOCK.Runtime.exe` controlled host load the selected plugin types.

The project ships its own assembly named `BepInEx.dll`; upstream BepInEx is not a runtime dependency. The shim covers a common subset, not the full BepInEx 5 API. The controlled host is evidence for API behavior and failure isolation, not evidence that arbitrary commercial Unity games work.

| Capability | Status |
| --- | --- |
| PE/CLR classification | implemented |
| Known BepInEx reference signals | exact assembly references plus attributes |
| Exact assembly/plugin metadata | implemented (B0) |
| Process, dependency, incompatibility and cycle checks | tested (B1) |
| Dependency-ordered load plan | tested (B1) |
| `BaseUnityPlugin` construction and `Awake` | tested in controlled harness (B2) |
| `Info`, `Logger`, `Config` initialized before `Awake` | tested (B2) |
| Structured logging and plugin error isolation | tested (B2) |
| Config save/reload: bool, int, double, enum, string, shortcut | tested (B2) |
| Real commercial Unity Mono game lifecycle | not implemented |
| Full upstream BepInEx API | not claimed |
