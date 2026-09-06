# Filters and userscripts

[Userscripts config](https://github.com/nabekhan/user-filter-scripts/blob/main/dist/userscripts.config.json)
· [Filter config](https://github.com/nabekhan/user-filter-scripts/blob/main/dist/filter.config.json)

Platform-specific subscriptions assembled from `filter.config.json`.

## Lists

Local entries specify a `file` path relative to `lists/`. The path may include
subfolders. Remote entries specify an HTTPS `url`. Every enabled entry must
specify exactly one of `file` or `url`.

```json
{
  "lists": {
    "siri-ai-enable": {
      "category": "other",
      "enabled": true,
      "file": "siri-ai-enable.txt"
    },
    "norsagir-youtube-hide-shorts": {
      "category": "nuisances",
      "enabled": true,
      "url": "https://raw.githubusercontent.com/Norsagir/adguard-custom-filters/main/youtube-hide-shorts.txt"
    },
    "norsagir-youtube-shorts-extras": {
      "category": "nuisances",
      "enabled": true,
      "file": "youtube/youtube-shorts-extras.txt"
    }
  }
}
```

Source comments are removed from generated subscriptions. Subscription metadata
and checksums are retained. `dist/filter.config.json` contains the same entries
with local files converted to raw URLs. The workflow creates that file before
using it to build the combined filters.

## Build

Node 22 is required.

```sh
npm ci
npm run format
npm run validate
```

`npm ci` configures the repository's pre-commit hook. The hook runs the
formatter and stops the commit if formatting produces changes so they can be
reviewed and staged.

Generated subscriptions are written to `dist/`.

Use the matching raw URL in AdGuard's **Custom filters** setting:

| Device / app               | Subscription path   |
| -------------------------- | ------------------- |
| AdGuard for iOS            | `dist/ios.txt`      |
| AdGuard for Android        | `dist/android.txt`  |
| AdGuard for Mac            | `dist/mac.txt`      |
| AdGuard for Windows        | `dist/windows.txt`  |
| AdGuard CLI for Linux      | `dist/linux.txt`    |
| AdGuard Mini / Safari      | `dist/safari.txt`   |
| Chromium browser extension | `dist/chromium.txt` |
| Firefox browser extension  | `dist/firefox.txt`  |

Raw URL prefix:

```text
https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/
```

Pull requests are validated. Pushes to `main` rebuild `dist/`.

## Userscripts

Enabled userscripts are listed in `userscripts.config.json`. Local `file` paths
are relative to `userscripts/`; remote scripts use an HTTPS `url`. The build
writes a URL-only copy to `dist/userscripts.config.json` for the installer.

Install
[`userscript-installer.user.js`](https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/userscripts/userscript-installer.user.js),
then navigate directly to a raw `userscripts.config.json` page. If the current
page contains a valid config JSON object, click **Install userscripts**. Managers
that support userscript menu commands also provide **Install userscripts from
this page**. The installer opens each enabled script so the userscript manager
can ask for confirmation.

This flow uses APIs supported by AdGuard, Userscripts for Safari, Tampermonkey,
and Violentmonkey. Silent bulk installation is not supported by these managers.
