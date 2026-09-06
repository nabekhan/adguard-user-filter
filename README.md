# Filters and userscripts

[Userscripts config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/userscripts/config.json)
· [Filter config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/filters/config.json)

## Filters

- Config: `config/filter.json`
- Local files: `sources/filters/<target>/<category>/<key>.txt`
- Generated config: `dist/filters/config.json`

Use `global` for multi-site rules. `source` is a local path or HTTPS URL.
Optional platforms: `android`, `chromium`, `firefox`, `ios`, `linux`, `mac`,
`safari`, and `windows`. Omit `platforms` to use all.

| Platform | Subscription path           |
| -------- | --------------------------- |
| iOS      | `dist/filters/ios.txt`      |
| Android  | `dist/filters/android.txt`  |
| Mac      | `dist/filters/mac.txt`      |
| Windows  | `dist/filters/windows.txt`  |
| Linux    | `dist/filters/linux.txt`    |
| Safari   | `dist/filters/safari.txt`   |
| Chromium | `dist/filters/chromium.txt` |
| Firefox  | `dist/filters/firefox.txt`  |

Raw URL prefix: `https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/`

## Userscripts

- Config: `config/userscripts.json`
- Local files: `sources/userscripts/<target>/<category>/<key>.user.js`
- Generated config: `dist/userscripts/config.json`

Install the [Userscript Installer](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/tools/userscript-installer.user.js).
Open a raw userscript config page, click the bottom-right button, and confirm.

## Development

Node 24 is required.

```sh
npm ci
npm run format
npm run validate
```

`npm run format` normalizes config values, sorts entries by target, category,
and key, organizes local files, and removes empty folders. `global` and `other`
sort last.

`npm ci` installs the pre-commit formatting hook. Pull requests validate the
configs and filters. Pushes to `main` rebuild `dist/`.
