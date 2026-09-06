# Filters and userscripts

[Filter config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/filter.json)

[Userscripts config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/userscripts.json) (Requires: [Userscript Installer](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/userscript-installer.user.js))

## Filters

- Config: `sources/filter.json`
- Local files: `sources/filters/<target>/<key>.txt`
- Remote patches: `sources/filters/<target>/<key>.patch.mjs`
- Generated config: `dist/filter.json`

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
- Local files: `sources/userscripts/<target>/<key>.user.js`
- Remote patches: `sources/userscripts/<target>/<key>.patch.mjs`
- Patched files: `dist/userscripts/<key>.user.js`
- Generated config: `dist/userscripts.json`
- Patch entry: `{ from, to }`

## Development

Node: 24

```sh
npm ci
npm run format
npm run format:prune
npm run validate
```
