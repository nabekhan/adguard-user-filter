# Personal AdGuard filter

This is a small personal filter project: edit modular files in `lists/`, select
which ones are included in `filter.config.json`, then build AdGuard's official
platform-specific subscriptions. It uses the official
[`@adguard/filters-compiler`](https://www.npmjs.com/package/@adguard/filters-compiler)
package; this repository is **not** a fork of the compiler.

## Edit a list

Each list is one ordinary AdGuard syntax file. Enable or disable it in
`filter.config.json`:

```json
{
  "lists": {
    "youtube-shorts": { "enabled": true }
  }
}
```

Create another list at `lists/name.txt`, then add its `enabled` Boolean to the
config. The starter YouTube Shorts list is deliberately comment-only, so it does
not block anything until rules are added.

To include a remote list, give it a unique name and an HTTPS `url`:

```json
{
  "lists": {
    "youtube-shorts": { "enabled": true },
    "norsagir-youtube-hide-shorts": {
      "enabled": true,
      "url": "https://raw.githubusercontent.com/Norsagir/adguard-custom-filters/main/youtube-hide-shorts.txt"
    }
  }
}
```

Remote lists are downloaded when the filter is built and compiled into every
compatible platform subscription. Pin the URL to a release or commit when you
need reproducible builds; a URL that tracks the latest version can change the
generated subscriptions without a corresponding source change here.

## Build

Node 22 is required.

```sh
npm ci
npm run validate
```

`validate` compiles every enabled list for each platform and runs AGLint over
the source files. The generated subscriptions are committed in `dist/`;
AdGuard's temporary compiler files stay ignored.

After this repository is published as `nabekhan/adguard-user-filter`, use the
raw URL for the matching device in AdGuard's **Custom filters** setting:

| Device / app | Subscription path |
| --- | --- |
| AdGuard for iOS | `dist/ios.txt` |
| AdGuard for Android | `dist/android.txt` |
| AdGuard for Mac | `dist/mac.txt` |
| AdGuard for Windows | `dist/windows.txt` |
| AdGuard CLI for Linux | `dist/linux.txt` |
| AdGuard Mini / Safari | `dist/safari.txt` |
| Chromium browser extension | `dist/chromium.txt` |
| Firefox browser extension | `dist/firefox.txt` |

For example, iOS uses:

```text
https://raw.githubusercontent.com/nabekhan/adguard-user-filter/main/dist/ios.txt
```

The workflow validates pull requests. On a push to `main`, it rebuilds and
commits any changed `dist/` files. Dependabot opens weekly pull requests for
both npm dependencies and GitHub Actions; review those updates before merging.

The compiler removes rules that a target cannot support, so the separate device
URLs are intentional. Prefer ordinary network and cosmetic rules for the
widest compatibility.
