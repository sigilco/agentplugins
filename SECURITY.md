# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅ Yes    |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing the maintainers directly or using [GitHub private vulnerability reporting](https://github.com/sigilco/agentplugins/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 72 hours and will coordinate a fix and disclosure timeline with you.

## Scope

In scope:
- Remote code execution via plugin manifests or install flow
- Path traversal in adapter output generators
- Prototype pollution in manifest parsing
- Supply chain issues in published npm packages

Out of scope:
- Issues in community plugins (report to their respective repos)
- Theoretical issues without a practical exploit path
