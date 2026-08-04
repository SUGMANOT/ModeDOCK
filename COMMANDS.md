# ModeDOCK command reference

## Core workflow

```bash
moddock target add --root <path>
moddock install <file-or-folder> --dry-run
moddock install <file-or-folder>
moddock list
```

## Management

```bash
moddock enable <item>
moddock disable <item>
moddock reinstall <item>
moddock remove <item>
```

## Diagnostics

```bash
moddock doctor
moddock paths
moddock --help
```

## Recovery

```bash
moddock backup create --name "Before update"
moddock backup recover
```

For complete options use:

```bash
moddock --help
```
