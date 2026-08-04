# Harmony compatibility

Current tested level: **H1-H4 in the cooperative ModeDOCK harness; arbitrary game-method detouring is not claimed**.

ModeDOCK ships its own assembly named `0Harmony.dll`; upstream Harmony is not a runtime dependency. The shim provides common Harmony attributes/types, `AccessTools`, an owner-aware patch registry, deterministic priority/before/after ordering, Prefix/Postfix dispatch, unpatch, and special parameters. The automated harness routes controlled methods through `HarmonyRuntime`; this proves dispatch semantics but is not a native detour backend for arbitrary Unity/Mono methods.

H3 guarantees Finalizer execution around the cooperative Prefix/original/Postfix pipeline and supports exception observation, replacement and suppression. H4 chains owner-ordered `IEnumerable<CodeInstruction>` transforms, preserves labels/exception-block markers, verifies control-flow stack depth, regenerates supported static methods with `DynamicMethod`, and publishes original/final IL diagnostics including the failing owner.

The game-plugin planner still rejects `HarmonyTranspiler` with `UNSUPPORTED_HARMONY_API`: the H4 backend is tested only for controlled cooperative methods and is not a general Unity/Mono detour. This distinction prevents a harness test from being misreported as commercial-game compatibility.

| Capability | Status |
| --- | --- |
| Harmony references/attributes | implemented H0 inspection |
| Listed attribute/type surface and common `AccessTools` | implemented H1 subset |
| Static/instance, void/value return | tested H2 cooperative dispatch |
| ref/out, `__instance`, `__result`, `__state`, `__originalMethod`, `___field` | tested H2 cooperative dispatch |
| bool Prefix skip-original | tested H2 cooperative dispatch |
| Multiple owners, priority, before/after, unpatch | tested H2 registry |
| Open generic, abstract, varargs, native/internal methods | explicit `PatchNotSupportedException` |
| Arbitrary method detour in a Unity Mono process | not implemented |
| Finalizer exception access/replacement/suppression | tested H3 cooperative dispatch |
| Transpiler chain, regeneration and owner diagnostics | tested H4 controlled static methods |
| Labels and exception blocks | represented and emitted in controlled H4 compiler |
| Control-flow stack balance and unverifiable IL refusal | tested H4 verifier |
| Plugin Transpiler in an arbitrary Unity Mono game | blocked with `UNSUPPORTED_HARMONY_API` |
