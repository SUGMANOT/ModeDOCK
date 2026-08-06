# Package format

A source package is a directory with a `moddock.json` manifest and all declared payload files.

## Identity

Package and game identifiers use:

```text
[a-z0-9][a-z0-9._-]{1,127}
```

Versions use semantic versioning.

## Complete example

```json
{
  "schemaVersion": 1,
  "id": "author.better-ui",
  "version": "2.1.0",
  "name": "Better UI",
  "description": "Improves the in-game interface.",
  "authors": ["Author"],
  "homepage": "https://example.org/better-ui",
  "license": "MIT",
  "scope": "client",
  "game": {
    "id": "example-game",
    "version": ">=1.4.0 <1.7.0"
  },
  "loader": {
    "id": "bepinex",
    "version": "^5.4.0"
  },
  "platforms": ["win32", "linux"],
  "architectures": ["x64"],
  "dependencies": {
    "author.common-api": "^3.0.0"
  },
  "optionalDependencies": {
    "author.extra-icons": "^1.0.0"
  },
  "conflicts": {
    "other.legacy-ui": "*"
  },
  "files": [
    {
      "source": "BetterUI.dll",
      "destination": "plugins"
    },
    {
      "source": "defaults/better-ui.cfg",
      "destination": "config",
      "target": "better-ui.cfg"
    }
  ]
}
```

## File rules

`source` is relative to the package root.

`destination` is a logical key. The active game profile maps it to a directory:

```json
{
  "root": ".",
  "plugins": "BepInEx/plugins",
  "config": "BepInEx/config"
}
```

`target` is optional and relative to the selected logical destination. When omitted, the source basename is used.

Package paths cannot contain traversal components, absolute paths, drive prefixes, NTFS alternate data streams, trailing dots/spaces, empty segments, or Windows reserved names.

## Dependencies

Required dependencies are installed automatically. The resolver chooses the highest set of versions satisfying all constraints.

Optional dependencies are metadata-only in `0.1.0`; a launcher may display them, but the core does not automatically add them.

Conflicts are checked in both directions against selected packages.

## No scripts

The format deliberately has no install, postinstall, launch, PowerShell, shell, or JavaScript hook. A package may contain executable game plugins, but package installation itself remains data-only.
