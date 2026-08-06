# Example Challenge Capsule

This directory demonstrates the new ModeDOCK 0.2 Challenge Capsule format.

It intentionally declares no packages. Create a profile whose game ID is `example-game`, version is `1.x`, and loader is `bepinex` 5.4.x. The game root may be an empty test directory.

```bash
mkdir example-game

moddock-core profile create example \
  --game example-game \
  --root ./example-game \
  --version 1.5.0 \
  --loader bepinex \
  --loader-version 5.4.23

moddock-core capsule inspect ./examples/challenge-capsule/challenge.json --profile example
moddock-core capsule prepare example ./examples/challenge-capsule/challenge.json
moddock-core capsule arm <session-id> --participant demo
```

Optionally create evidence:

```bash
mkdir -p example-game/saves
echo '{"score":4200}' > example-game/saves/challenge-result.json
```

Finish and restore:

```bash
moddock-core capsule finish <session-id> \
  --claim score=4200 \
  --claim completed=true \
  --out ./example-result \
  --restore
```

No game process is started by ModeDOCK at any point.
