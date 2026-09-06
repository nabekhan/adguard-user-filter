# Filters and userscripts

[Userscripts config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/userscripts.json)
· [Filter config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/filter.json)

## Filters

- Config: `sources/filter.json`
- Local files: `sources/filters/<target>/<category>/<key>.txt`
- Remote patches: `sources/filters/<target>/<category>/<key>.patch.json`
- Generated config: `dist/filter.json`

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

- Config: `sources/userscripts.json`
- Local files: `sources/userscripts/<target>/<category>/<key>.user.js`
- Remote patches: `sources/userscripts/<target>/<category>/<key>.patch.json`
- Patched files: `dist/userscripts/<target>/<category>/<key>.user.js`
- Generated config: `dist/userscripts.json`

Install the [Userscript Installer](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/tools/userscript-installer.user.js).
Open a raw userscript config page, click the bottom-right button, and confirm.

## Development

Node 24 is required.

```sh
npm ci
npm run format
npm run validate
```

`npm run format` normalizes and sorts configs, organizes local files, creates or
removes remote patch files, and deletes empty folders. `global` and `other` sort
last.

`npm ci` installs the pre-commit formatting hook. Pull requests validate the
configs and filters. Pushes to `main` rebuild `dist/`.
