# Быстрый старт ModeDOCK Core

ModeDOCK Core — это ядро для собственного менеджера модов, launcher или панели игрового сервера. Пользователь работает с профилями и пакетами, а ядро отвечает за зависимости, проверку файлов, резервные копии и откат.

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

`--dest` связывает логические назначения пакетов с реальными каталогами игры.

## Подключение registry

```powershell
moddock-core registry add coop community C:\ModeDOCKRegistry\registry.json
```

Registry можно разместить на обычном HTTPS-хостинге или GitHub Pages.

## Установка

Сначала обязательно просмотрите план:

```powershell
moddock-core add coop author.example-mod@^1.0.0 --dry-run
```

Затем примените:

```powershell
moddock-core add coop author.example-mod@^1.0.0
```

## Проверка и восстановление

```powershell
moddock-core verify coop
moddock-core transactions
moddock-core recover <transaction-id>
```

При внешнем изменении управляемого файла ModeDOCK Core прекращает опасную операцию, а не перезаписывает изменение молча.

## Создание собственного пакета

В каталоге мода создайте `moddock.json`:

```json
{
  "schemaVersion": 1,
  "id": "author.example-mod",
  "version": "1.0.0",
  "name": "Example Mod",
  "game": {
    "id": "example-game",
    "version": ">=1.4.0 <2.0.0"
  },
  "loader": {
    "id": "bepinex",
    "version": "^5.4.0"
  },
  "dependencies": {
    "author.common-api": "^2.0.0"
  },
  "files": [
    {
      "source": "ExampleMod.dll",
      "destination": "plugins"
    }
  ]
}
```

Соберите пакет и индекс:

```powershell
moddock-core pack .\example-mod --out .\registry
moddock-core registry build .\registry --name "My Game Mods"
```

Теперь `registry` можно опубликовать как набор статических файлов.
