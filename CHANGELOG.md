# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.1.0 - 2026-09-01

### Added

- Convert standalone GitHub repository links into Open Graph preview cards.
- Fetch and cache repository title, description, and social preview image.
- Preserve inline and nested GitHub links without conversion.
- Fall back to stale cache data or the original link when GitHub is unavailable.
- Include responsive light and dark styles with accessible focus states.
- Cover URL parsing, rendering, metadata, cache, fallback, and Hexo registration with tests.
