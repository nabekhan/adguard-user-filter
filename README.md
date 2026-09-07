# Ad filters, DNS filters, and userscripts

[Ad filter config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/adfilters.json)

[DNS filter config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/dnsfilters.json)

[Userscripts config](https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/userscripts.json)

## Ad filters

- Config: `sources/adfilters.json`
- Local files: `sources/adfilters/<target>/<key>.txt`
- Remote patches: `sources/adfilters/<target>/<key>.patch.mjs`
- Generated config: `dist/adfilters.json`

| Platform | Subscription path             |
| -------- | ----------------------------- |
| iOS      | `dist/adfilters/ios.txt`      |
| Android  | `dist/adfilters/android.txt`  |
| Mac      | `dist/adfilters/mac.txt`      |
| Windows  | `dist/adfilters/windows.txt`  |
| Linux    | `dist/adfilters/linux.txt`    |
| Safari   | `dist/adfilters/safari.txt`   |
| Chromium | `dist/adfilters/chromium.txt` |
| Firefox  | `dist/adfilters/firefox.txt`  |

## DNS filters

- Config: `sources/dnsfilters.json`
- Local files: `sources/dnsfilters/<target>/<key>.txt`
- Remote patches: `sources/dnsfilters/<target>/<key>.patch.mjs`
- Generated config: `dist/dnsfilters.json`
- Compiler: `@adguard/hostlist-compiler`
- Validation: `Validate`, AGLint

| Target  | Subscription path             |
| ------- | ----------------------------- |
| Mobile  | `dist/dnsfilters/mobile.txt`  |
| Desktop | `dist/dnsfilters/desktop.txt` |
| Server  | `dist/dnsfilters/server.txt`  |

## Config

- `platforms`: included platforms
- `excludePlatforms`: excluded platforms
- `platforms` and `excludePlatforms` are mutually exclusive
- Missing local sources: stubbed by `npm run format`
- Missing remote patches: stubbed by `npm run format`
- Unlisted local files: removed by `npm run format:prune`
- Raw URL prefix:
  `https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/`

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
