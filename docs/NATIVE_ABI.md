# ModeDOCK Native ABI

## Compatibility level N1

ModeDOCK Native ABI v1 is an experimental metadata and self-test contract for native plugins. It is not a game-process injector and does not define game modification hooks.

Required exports:

```text
ModeDOCK_GetApiVersion
ModeDOCK_GetName
ModeDOCK_GetDescription
ModeDOCK_TestPing
```

The public declaration is in `native/include/modedock_plugin.h`.

- Strings are null-terminated UTF-8 owned by the plugin and must not exceed 4096 bytes.
- API version must be `1`.
- `ModeDOCK_TestPing() == 1` means that the plugin self-test succeeded.
- A missing required export is `invalid-native-plugin`.
- A process/plugin architecture mismatch is `architecture-mismatch`.
- An unknown API version is `unsupported-api-version`.
- `ModeDOCK_Load`, `ModeDOCK_Unload`, and `ModeDOCK_GetCapabilities` are reserved. ABI v1 hosts do not call them.

`moddock dll inspect` only validates the static export surface. It does not load or execute the plugin and therefore cannot validate return values.

Explicit dynamic validation runs in `moddock-native-probe.exe`, never in the CLI process:

```powershell
moddock dll probe "C:\path\plugin.dll" --execute-probe
```

The helper runs without elevation, assigns itself to a Windows Job Object with an active-process limit of one and kill-on-close behavior, suppresses DLL stdout/stderr during execution, enforces the 4096-byte string limit, and emits one JSON result. The TypeScript client terminates it after five seconds or after 1 MiB of output. Non-interactive use additionally requires `--force` as explicit confirmation.

## Fixture

`tests/fixtures/ModeDOCK_DeadCells_Test(1).dll` is the immutable N1 fixture:

- SHA-256: `afa645eb193116ca426ef9e86a1b9426e87d59da02e39b6269f4cb8a53c4a8bb`
- PE32+, x64, native
- no CLR header and no imports
- four required N1 exports

The fixture is inert and is not a Dead Cells bootstrap or a BepInEx/Harmony compatibility test.
