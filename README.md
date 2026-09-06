# AdGuard user filter

Platform-specific subscriptions assembled from `filter.config.json`.

## Lists

Local entries specify a `file` path relative to `lists/`. The path may include
subfolders. Remote entries specify an HTTPS `url`. Every enabled entry must
specify exactly one of `file` or `url`.

```json
{
  "lists": {
    "siri-ai-enable": {
      "category": "allowlists",
      "enabled": true,
      "file": "siri-ai-enable.txt"
    },
    "norsagir-youtube-hide-shorts": {
      "category": "nuisances",
      "enabled": true,
      "url": "https://raw.githubusercontent.com/Norsagir/adguard-custom-filters/main/youtube-hide-shorts.txt"
    },
    "youtube-shorts-extras": {
      "category": "nuisances",
      "enabled": true,
      "file": "youtube/youtube-shorts-extras.txt"
    }
  }
}
```

Source comments are removed from generated subscriptions. Subscription metadata
and checksums are retained.

## Build

Node 22 is required.

```sh
npm ci
npm run format
npm run validate
```

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
https://raw.githubusercontent.com/nabekhan/adguard-user-filter/main/
```

Pull requests are validated. Pushes to `main` rebuild `dist/`.
