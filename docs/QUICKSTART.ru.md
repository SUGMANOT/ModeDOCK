# Быстрый старт ModeDOCK Core 0.2

ModeDOCK Core — это безопасное ядро для управления модифицированными окружениями и **Challenge Capsules**.

Challenge Capsule — не исполняемый файл и не кнопка запуска игры. Это переносимый контракт испытания, который описывает:

- подходящую игру и loader;
- необходимые пакеты и версии;
- цель и правила;
- файлы, которые нужно проверить до и после прохождения;
- данные результата: очки, время, seed, факт завершения;
- подсказки для launcher, OBS или Discord-бота.

ModeDOCK подготавливает окружение, выдаёт ticket, ждёт, пока пользователь сам запустит игру, затем формирует result bundle и может вернуть предыдущий профиль.

## Установка из исходников

```bash
npm install
npm run verify
npm run build
npm link
```

После `npm link` доступна команда `moddock-core`.

## Создание профиля

```powershell
moddock-core profile create coop `
  --game example-game `
  --root "C:\Games\Example" `
  --version 1.5.0 `
  --loader bepinex `
  --loader-version 5.4.23 `
  --dest root=. `
  --dest plugins=BepInEx/plugins `
  --dest config=BepInEx/config
```

## Пример Challenge Capsule

Проверить файл и совместимость:

```powershell
moddock-core capsule inspect `
  .\examples\challenge-capsule\challenge.json `
  --profile coop
```

Посмотреть план без изменений:

```powershell
moddock-core capsule prepare `
  coop `
  .\examples\challenge-capsule\challenge.json `
  --dry-run
```

Подготовить окружение:

```powershell
moddock-core capsule prepare coop .\examples\challenge-capsule\challenge.json
```

Команда вернёт `session-id`. Затем нужно активировать испытание:

```powershell
moddock-core capsule arm <session-id> --participant streamer-name
```

После этого пользователь запускает игру самостоятельно: через Steam, ярлык или свой launcher. ModeDOCK не запускает процессы из Capsule.

Завершить испытание:

```powershell
moddock-core capsule finish <session-id> `
  --claim score=4200 `
  --claim completed=true `
  --out .\challenge-result
```

Вернуть предыдущий профиль:

```powershell
moddock-core capsule restore <session-id>
```

Можно завершить и восстановить одной командой, добавив `--restore`.

## Создание своей Capsule

```powershell
moddock-core capsule init .\my-challenge `
  --id author.my-challenge `
  --game example-game `
  --title "No Healing Run"
```

Будут созданы `challenge.json` и README. Отредактируйте цель, правила, пакеты, evidence и claims, затем проверьте:

```powershell
moddock-core capsule inspect .\my-challenge\challenge.json
```

Полное описание: [`CHALLENGE_CAPSULES.md`](CHALLENGE_CAPSULES.md).

## Обычная установка пакетов

Подключить registry:

```powershell
moddock-core registry add coop community C:\ModeDOCKRegistry\registry.json
```

Предпросмотр и установка:

```powershell
moddock-core add coop author.example-mod@^1.0.0 --dry-run
moddock-core add coop author.example-mod@^1.0.0
```

Проверка и восстановление транзакций:

```powershell
moddock-core verify coop
moddock-core transactions
moddock-core recover <transaction-id>
```

## Важно о результатах

Ticket и result защищены SHA-256 от незаметного изменения, но версия 0.2 ещё не подписывает их ключом автора или участника. Это не античит и не доказательство личности. ModeDOCK проверяет только управляемое окружение, объявленные evidence-файлы и переданные claims.
