# @agentplugins/core

## 0.4.0

### Minor Changes

- ## v0.4.0 — Architecture re-shape + security hardening

  ### New packages

  - **`@agentplugins/contract`** — single-source-of-truth Zod manifest schema. All `PluginManifest` types now derive from one place; a `manifest.schema.json` is generated at build time.
  - **`@agentplugins/compile`** — shared codegen kernel extracted from core: `hook-wrapper`, `codegen`, `lint`, `validation`, `subprocess`, plus new secure emit helpers and path-traversal sanitizers.

  ### Security fixes (release-blocking)

  - **B2a** `sanitizeName()` in `store.addPluginFromSource` — rejects `..`, absolute paths, non-kebab-case plugin names before installing to the store.
  - **B2b** `sanitizeJoin()` for `nativeCopies.from/to` in `cli build` — prevents path traversal when copying native artifacts into the build output.
  - **A3/opencode** `emitCommandAsExecSync()` replaces template-literal interpolation + `shell:true` for command handler emission. Command string is JSON-encoded; plugin-root substitution uses runtime `.replace()`.
  - **A3/pimono** Same fix for pimono's `generateCommandHandlerBody` — JSON.stringify + runtime sentinel replace instead of template-literal injection.

  ### Architecture

  - `@agentplugins/core` is now a pure re-export facade; types come from `contract`, compile helpers from `compile`.
  - `PluginManifest` is a concrete TypeScript interface (not `Omit<z.infer<...>>`) so consumers don't need `zod` in their transitive type-resolution path.
  - `adapter-gemini` hook iteration updated to `Object.entries(plugin.hooks)` to match the `HookDefinition` contract API.

### Patch Changes

- Updated dependencies
  - @agentplugins/compile@0.5.0
  - @agentplugins/contract@0.5.0

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
