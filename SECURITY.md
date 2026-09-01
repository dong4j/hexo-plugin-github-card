# Security Policy

## Supported versions

Security fixes are provided for the latest released minor version.

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `<0.1.0` | No |

## Reporting a vulnerability

Please do not disclose a vulnerability in a public issue.

Use GitHub's private vulnerability reporting feature for this repository. If that channel is unavailable, email `dong4j@gmail.com` with:

- the affected version;
- a minimal reproduction or proof of concept;
- the expected impact;
- any suggested mitigation.

You should receive an acknowledgement within seven days. Please allow time for a fix and coordinated disclosure before publishing details.

## Security boundaries

This plugin fetches metadata only for public `github.com/{owner}/{repository}` URLs. Reports that bypass the GitHub-only request boundary, inject unescaped Open Graph content, or expose local build data are treated as security issues.
