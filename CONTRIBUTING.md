# Contributing

Thanks for helping improve `hexo-plugin-github-card`.

## Before opening an issue

- Search existing issues for the same behavior.
- Confirm the URL is a GitHub repository home page rather than an issue, pull request, release, or file URL.
- Include the Node.js version, Hexo version, theme name, relevant configuration, and the smallest Markdown example that reproduces the problem.
- Remove tokens, private repository names, and other sensitive information from logs or examples.

Security vulnerabilities must follow [SECURITY.md](./SECURITY.md) instead of a public issue.

## Development setup

```bash
git clone https://github.com/dong4j/hexo-plugin-github-card.git
cd hexo-plugin-github-card
npm install
npm test
```

## Pull requests

1. Keep each change focused on one problem.
2. Add or update tests when behavior changes.
3. Preserve the plugin's compatibility and fallback boundaries.
4. Add comments for non-obvious security, caching, or Hexo integration constraints.
5. Run `npm test`, `npm pack --dry-run`, and `git diff --check` before submitting.
6. Update the `Unreleased` section in `CHANGELOG.md` for user-visible changes.

By contributing, you agree that your contribution is licensed under the project's MIT License.
