# @agentplugins/core

## 0.3.0

### Minor Changes

- ## v0.3.0 — Tier-1 parity wins + compat ingestor + security

  **Tier-1 parity wins (3.1–3.6)**

  - **3.1** — Subagent lifecycle parity: Pi `stop`↔`subagentStop` collision fixed; OpenCode emits a documented WARN (not error) for subagent hooks instead of silently dropping them
  - **3.2** — `mcpServers` is now the recommended universal tool path; `tools[]` targeting Claude/Codex emits a WARN with a pointer to `mcpServers`
  - **3.3** — Schema sync: `HandlerType` `file` renamed to `reference` matching the spec; `settings` duplicate removed from `PluginManifest`; `agentplugins init` dep pins updated from `^0.1.0` to `^0.2.0`
  - **3.4** — Tier-1 capability matrix published at `docs-site/reference/compat-matrix.md`
  - **3.5** — `Command` and `AgentDefinition` types added to `PluginManifest`; `agentplugins-caveman` and `agentplugins-ponytail` community rewrites ship `agentplugins.config.ts` installable via `agentplugins add`
  - **3.6** — Ecosystem page + tier-1 parity porting guide

  **Epic #24 — compat ingestor + security guardrails**

  - `@agentplugins/ingest` — claude-code, codex, and skills-sh format ingestors with structured warnings
  - `@agentplugins/migrate` — MCP server with scan / convert / diff-manifest / verify-integrity / write-manifest tools
  - `@agentplugins/security` — osv-scanner, Scorecard, npm provenance wrappers; safe-fetch SSRF guard; lifecycle script policy
  - `agentplugins import <format> <source>` CLI command
  - `agentplugins audit <source>` CLI command with `--json` output
  - Schema v1.1: `dependencies[]`, `sidecar`, `integrity` fields

  **Other**

  - Relicensed MIT → Apache-2.0

## 0.1.0

### Minor Changes

- bce92e4: Initial public release of AgentPlugins

  This is the first public release of AgentPlugins, a unified plugin library for AI agent harnesses. Write your plugins once and compile them for multiple platforms:

  - **@agentplugins/core** - Core types, validation, registry, and hook-wrapper generator
  - **@agentplugins/cli** - Build/validate/init commands for compiling plugins
  - **Adapters** - Platform-specific adapters for Claude Code, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono

  ## Getting Started

  ```bash
  # Install the CLI
  npm install -g @agentplugins/cli

  # Initialize a new plugin
  agentplugins init my-plugin

  # Build for all platforms
  agentplugins build

  # Build for specific platform
  agentplugins build --platform claude
  ```
