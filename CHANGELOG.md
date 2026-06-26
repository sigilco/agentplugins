# Changelog

All notable changes to this project are documented in this file.

## v0.3.0 — Tier-1 Parity Wins + Compat Ingestor + Security

### Tier-1 parity wins (3.1–3.6)

- **3.1** — Subagent lifecycle parity: Pi `stop`↔`subagentStop` collision fixed; OpenCode emits a documented WARN for subagent hooks instead of silently dropping them ([#33](https://github.com/espetro/agentplugins/issues/33))
- **3.2** — `mcpServers` documented as the universal tool path; `tools[]` scoped to opencode/pimono, WARN on others ([#34](https://github.com/espetro/agentplugins/issues/34))
- **3.3** — Schema sync: `HandlerType` `file` renamed to `reference`; `settings` duplicate removed; dep pins updated ([#35](https://github.com/espetro/agentplugins/issues/35))
- **3.4** — Tier-1 capability matrix published at `docs-site/reference/compat-matrix.md` ([#36](https://github.com/espetro/agentplugins/issues/36))
- **3.5** — `Command` and `AgentDefinition` types added; `agentplugins-caveman` and `agentplugins-ponytail` community rewrites ship ([#37](https://github.com/espetro/agentplugins/issues/37))
- **3.6** — Ecosystem page + tier-1 parity porting guide ([#38](https://github.com/espetro/agentplugins/issues/38))

### Epic #24 — Compat ingestor + security guardrails

- `@agentplugins/ingest` — claude-code, codex, and skills-sh format ingestors with structured warnings ([#24](https://github.com/espetro/agentplugins/issues/24))
- `@agentplugins/migrate` — MCP server with scan / convert / diff-manifest / verify-integrity / write-manifest tools
- `@agentplugins/security` — osv-scanner, Scorecard, npm provenance wrappers; safe-fetch SSRF guard; lifecycle script policy
- `agentplugins import <format> <source>` and `agentplugins audit <source>` CLI commands
- Schema v1.1: `dependencies[]`, `sidecar`, `integrity` fields

### Other

- Relicensed MIT → Apache-2.0

## v0.2.0 — Distribution MVP

- **Distribution-first pivot**: `agentplugins add <github-url>` installs a plugin once, fans out to every detected agent harness via symlinks
- 5 install channels: native binary, npm, Homebrew, curl, Mise (UBI backend day one)
- `~/.agents/plugins/<name>/` universal store with per-agent symlink fanout
- Skills.sh compatibility (reads `SKILL.md`, scans `~/.agents/skills/`)
- Bun-compiled native binaries for 8 targets → GitHub Releases
- `@agentplugins/schema` package + hosted JSON Schema at `agentplugins.dev/schema/v1.json`
- VitePress landing page

## v0.1.0 — Initial Public Release

First public release of AgentPlugins — a universal plugin format and platform-specific adapters for AI agent harnesses.

- **@agentplugins/core** — Universal plugin manifest types and validation ([#5](https://github.com/espetro/agentplugins/issues/5))
- **@agentplugins/cli** — `build`, `validate`, `init` commands ([#6](https://github.com/espetro/agentplugins/issues/6))
- **7 Platform Adapters** — compile universal format to native formats:
  - Claude Code ([#1](https://github.com/espetro/agentplugins/issues/1))
  - Codex ([#2](https://github.com/espetro/agentplugins/issues/2))
  - Copilot ([#3](https://github.com/espetro/agentplugins/issues/3))
  - Gemini ([#4](https://github.com/espetro/agentplugins/issues/4))
  - Kimi ([#7](https://github.com/espetro/agentplugins/issues/7))
  - OpenCode ([#2](https://github.com/espetro/agentplugins/issues/2))
  - Pi Mono
- **example-logger** — reference implementation compiling to all 7 platforms
- Public npm release under `@agentplugins/*`

---

The roadmap and future releases are tracked in [GitHub Project 14](https://github.com/users/espetro/projects/14/views/1).
