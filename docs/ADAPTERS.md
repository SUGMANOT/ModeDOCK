# Target adapter guide

A target adapter is a small ESM module. It may detect candidates and describe routing rules, but it does not write target files.

```ts
interface TargetAdapter {
  id: string;
  name: string;
  detect(context: { roots: string[]; platform: NodeJS.Platform }): Promise<DetectedTarget[]>;
  createProfile(input: Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">): TargetProfile;
  validate(profile: TargetProfile): Promise<string[]>;
  routeFile(profile: TargetProfile, sourceRelative: string): "root" | "mods" | "plugins" | "config" | string;
}
```

## Loading a custom adapter

Compile the adapter to an ESM `.mjs` file, then add its absolute path:

```bash
moddock config set customAdapters "C:\ModeDOCKAdapters\my-game.mjs"
moddock doctor
moddock target add --adapter my-game --name "My Game" --root "C:\Games\MyGame" --exe MyGame.exe
```

Multiple paths may be supplied as a comma-separated value or JSON array. Adapter IDs must be stable and unique.

## Rules

- Detection must be read-only and return only paths it can justify.
- Validate required loaders/directories without mutating them.
- Return target-relative destination categories or paths; never accept `..`, absolute paths, or drive-qualified values.
- Do not copy, delete, inject, download, launch, or modify processes from an adapter.
- Do not embed anti-cheat or DRM bypass behavior.
- Treat target-specific modules as optional so the generic manual adapter always works.
- Add temporary-directory tests for detection, validation, and routing.

See `examples/adapters/example-adapter.ts` for a complete source example.
