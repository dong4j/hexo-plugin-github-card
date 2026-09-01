# hexo-plugin-github-card

[简体中文](./README.zh-CN.md)

[![CI](https://github.com/dong4j/hexo-plugin-github-card/actions/workflows/ci.yml/badge.svg)](https://github.com/dong4j/hexo-plugin-github-card/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Hexo](https://img.shields.io/badge/hexo-6%20%7C%207%20%7C%208-0e83cd?logo=hexo&logoColor=white)](https://hexo.io/)

Turn a standalone GitHub repository URL in a Hexo post into a responsive Open Graph preview card. No custom tag syntax and no GitHub token are required.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dong4j/hexo-plugin-github-card/main/docs/images/github-card-dark.png">
  <img src="https://raw.githubusercontent.com/dong4j/hexo-plugin-github-card/main/docs/images/github-card-light.png" alt="GitHub repository preview card rendered by hexo-plugin-github-card">
</picture>

## Features

- Keeps Markdown portable: write a normal repository URL on its own line.
- Reads GitHub's `og:title`, `og:description`, and `og:image` at generation time.
- Converts repository home pages only; inline links, issues, pull requests, releases, and file URLs stay unchanged.
- Caches metadata locally to avoid repeated requests during Hexo generation.
- Falls back to stale cache data, or to the original link when no cache is available.
- Includes light, dark, mobile, keyboard-focus, and reduced-motion styles.
- Restricts outbound metadata requests to `github.com` repository URLs.

## Installation

Until the first npm release, install the plugin directly from GitHub:

```bash
npm install --save github:dong4j/hexo-plugin-github-card
```

Hexo loads packages whose names start with `hexo-` automatically.

## Usage

Put a GitHub repository URL on its own line:

```markdown
https://github.com/starcat-app/Starcat
```

The visible text must be the same repository URL. A custom-text or inline link is intentionally left untouched:

```markdown
Read the [Starcat documentation](https://github.com/starcat-app/Starcat) before installing it.
```

Disable conversion for one post with front matter:

```yaml
github_card: false
```

## Configuration

Add the following section to the Hexo `_config.yml` file:

```yaml
github_card:
  enable: true
  # Metadata freshness window in seconds. Default: 7 days.
  cache_ttl: 604800
  # Timeout for one GitHub Open Graph request in seconds.
  timeout: 8
```

Cached metadata is stored at:

```text
node_modules/.cache/hexo-plugin-github-card/metadata.json
```

## How it works

The plugin runs after Markdown rendering and inspects paragraph fragments. A paragraph is converted only when it contains exactly one anchor whose text and destination are the same `github.com/{owner}/{repository}` URL.

For every matching repository, the plugin:

1. checks the local metadata cache;
2. fetches the public GitHub repository page when the cache is missing or expired;
3. extracts Open Graph title, description, and social image;
4. emits an accessible repository card and a shared stylesheet route.

Requests are deduplicated during one generation. If a refresh fails, expired cache data remains usable. Without cache data, the original paragraph is preserved so a network failure does not break the Hexo build.

## Scope and security

The metadata fetcher accepts only HTTP(S) URLs on `github.com` with exactly two path segments. GitHub product routes and nested repository routes are rejected. This boundary prevents the build-time scraper from becoming a general-purpose URL fetcher.

Open Graph text is HTML-escaped before rendering, and image URLs must use HTTP or HTTPS.

## Compatibility

| Component | Supported versions |
| --- | --- |
| Node.js | `>=18.17` |
| Hexo | `6.x`, `7.x`, `8.x` |
| Browser | Modern browsers with CSS Grid support |

## Development

```bash
npm install
npm test
npm pack --dry-run
```

The test suite covers repository URL validation, standalone-link detection, safe HTML rendering, Open Graph extraction, cache freshness, offline fallback, and Hexo extension registration.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Security reports should follow [SECURITY.md](./SECURITY.md).

## Acknowledgements

The implementation draws on ideas from these MIT-licensed projects:

- [hexo-tag-ogp-link-preview](https://github.com/h-sugawara/hexo-tag-ogp-link-preview) for build-time Open Graph previews.
- [remark-link-card-plus](https://github.com/okaryo/remark-link-card-plus) for standalone-link semantics.
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper) for Open Graph metadata parsing.

## License

[MIT](./LICENSE) © 2026 dong4j
