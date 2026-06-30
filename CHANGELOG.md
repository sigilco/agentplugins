# Changelog

All notable changes to this project are documented in this file.

## v0.6.1 — CLI patch (Windows binary)

### `@agentplugins/cli`
- Bump to `0.6.1` to deliver the Windows (`x86_64-pc-windows-msvc`) binary missing from the v0.6.0 GitHub Release due to a CI archive bug (Bun appends `.exe` on Windows cross-compile; the zip step was referencing the bare filename). All other packages remain at `0.6.0`.

## v0.6.0 — Pipeline Kernel, defineConfig, Docs Site & Full-Stack Upgrade

### Architecture
- **`@agentplugins/pipeline`** — new middleware kernel: composable install pipeline with typed `PipelineContext`, `use()` registration, ordered execution, and abort support. Security gate migrated as a first-class pipeline plugin.
- **`defineConfig` API** — plugin bus + per-target overrides; custom-adapter extensibility via the pipeline.
- **`@agentplugins/contract`** zod 4 migration — schema as single source of truth; `zod-to-json-schema` at build time.
- **`@agentplugins/core`**, **`@agentplugins/migrate`** zod 4 migration.
- **`@agentplugins/store`** — GitHub tree-URL parsing for bare repo paths in `validateCloneUrl`.

### Adapters
- **`adapter-opencode`** — emits `mcpServers` as `mcp.servers` in `opencode.json` (breaking opencode config format alignment).
- **`adapter-claude`** / **`adapter-opencode`** — agent `model` + `fallbackModels` frontmatter support.
- **`adapter-copilot`** — universal hook-handler fix (copilot hook registration regression).

### Tooling / Build
- **tsup → tsdown** across all adapters + `@agentplugins/pipeline`.
- **cleye** (replaces cac) + **logtape** structured logging (replaces chalk) in CLI.
- **jiti v2** migration in CLI and `recompile-installed` script.
- **pnpm catalog** + `.nvmrc 22` + `engines.node >=22` across the monorepo.
- **`adapter-opencode`** / **`adapter-gemini`** tsc errors resolved.

### Docs / Site
- VitePress docs site: logo, sponsor CTA, reference landing page, SEO/sitemap/OG tags.
- Capability-matrix restructured; porting guide added.
- Domain updated `agentplugins.dev → agentplugins.pages.dev`; `$id` in schema JSON updated to match.

### Project / CI
- Community-health files: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, issue templates, PR template, `FUNDING.yml`, triage workflow.
- CI typecheck scoped to `packages/**` (docs site and `example-profiler` lack `tsc` config).
- Topological binary build in `release.yml` (`pnpm --filter './packages/**'` replaces selective filter).
- `adapter-codex` / `adapter-kimi` `peerDependencies` bumped `^0.5.0 → ^0.6.0`.

## v0.5.0 — @agentplugins/store + Setup Scripts

### New package
- **`@agentplugins/store`** — plugin install / link / update / detect lifecycle extracted from `core` into its own package. `installPlugin`, `updatePlugin`, `detectAgents`, symlink management (`linkCompiledPlugin`, `linkPluginSkills`, `linkNativeArtifacts`), `validateCloneUrl`, and the new setup-script runtime all live here. `@agentplugins/core` re-exports the public surface as a facade; existing imports through `@agentplugins/core` are unaffected. (Registry logic stays in `core` — it owns adapter registration, not store state.)

### Features
- **Setup scripts (mossy-koala)** — a plugin can declare a `setup` command (single string) in its manifest. After `agentplugins add`, the CLI prompts for trust and runs it; `agentplugins setup <name>` re-runs it later.
  - **Trust-on-first-use:** the command plus the contents of any referenced script are hashed (sha256) and persisted in `.agentplugins-meta.json`. A matching hash re-runs silently on subsequent invocations; a changed hash re-prompts.
  - **Auto-detect fallback:** when no `setup` field is declared, the CLI looks for `install.sh` → `setup.sh` → `postinstall.mjs` → `postinstall.js` (first hit) and treats it as lower-trust (`source: 'detected'`).
  - **Hard denylist always blocks** — `curl|sh`, `wget|sh`, `npx --yes`, `rm -rf /`, `chmod 777`, `eval`, `base64 -d|sh`. Cannot be overridden by `--yes` or prior trust.
  - **Flags & kill-switch:** `--yes` skips the prompt but still gates on the denylist; `--no-setup` skips setup entirely on `add`; `AGENTPLUGINS_SETUP_SCRIPTS=0` is a hard kill-switch.
  - Schema: top-level `setup: z.string().min(1).optional()` on the manifest. This is distinct from the `hooks.setup` lifecycle hook.

### Test coverage (B22)
- 51 new tests in `@agentplugins/store`: `linkPluginSkills` (15), `linkNativeArtifacts` incl. the `.mjs → .ts` rename (20), multi-artifact `linkCompiledPlugin` (16).
- 9 new CLI e2e tests: setup flow (kill-switch, deny, TOFU silent re-run, hash-change re-prompt), `setup` command, `add --no-setup`.

### Internal
- `@agentplugins/core` depends on `@agentplugins/store` (`workspace:*`); `@agentplugins/store` depends on `@agentplugins/compile` (for `sanitizeName`) and `@agentplugins/security` (for the denylist gate).
- `adapter-codex` / `adapter-kimi` `peerDependencies` bumped `^0.4.0` → `^0.5.0` (kept in lockstep per the changeset quirk documented in `.changeset/README.md`).

## v0.4.0 — Architecture Re-shape + Hardening

### Architecture
- **`@agentplugins/contract`** — new package: zod schema as single source of truth for the plugin manifest; TS types derived via `z.infer`; `manifest.schema.json` generated at build time via `zod-to-json-schema`. Eliminates the 4-copy drift class (previously: `spec/v1/manifest.schema.json`, `packages/schema/src/types.ts`, `packages/core/src/types.ts`, and inline zod).
- **`@agentplugins/compile`** — new shared codegen kernel with secure emit primitives (`emitCommandHandler`, `emitInlineHandler`, `sanitizeName`, `sanitizeJoin`, `mapHook`). All adapters route through this kernel — a capability now ships by editing one schema field + one kernel path, not 8 files.
- **`core` facade** — `@agentplugins/core/src/index.ts` re-exports from `contract`/`compile`; public API unchanged; sibling repos (`agentplugins-{goal,btw,flow,caveman,ponytail}`) unaffected. (Store isolation into its own `@agentplugins/store` package is planned for v0.5.0.)
- `ARCHITECTURE.md` at repo root documents the ports-&-adapters hexagonal compiler pipeline with mermaid diagrams: package dependency graph, compile pipeline (manifest→validate→IR→emit→files), distribute pipeline (source→fetch→install→link), and the adapter port contract.

### Authoring primitives

- **`continueWith`** — chained prompt injection via the `stop` hook. OpenCode adapter uses `ctx.session.sendMessage`; PiMono adapter uses `pi.sendUserMessage`. Per-session iteration capped at 20 by default; lint rule (`continueWithSafetyRule`) inspects inline handler source at build time.
- **`nativeEntry` / `nativeCopies`** — native artifact passthrough for non-JS plugin artifacts. Build command resolves and writes `nativeCopies` entries; adapters expose them in their output.
- **`adapterOverrides`** — runtime adapter override via `manifest.adapterOverrides.opencode` / `manifest.adapterOverrides.pimono`. Paths are sanitized against the plugin root at compile time; a runtime trust warning is emitted.
- **`capabilities: ['subprocess']`** — gates the child-process lint block. The `handlerSafetyRule` lint rule scans `command` handler strings for subprocess patterns; the gate only fires when the capability is absent.
- Inline handlers auto-wrapped as command scripts for Codex and Kimi adapters.

### Multi-artifact linking
- Multi-artifact `dist` linking for OpenCode: multiple compiled artifacts per plugin.
- Per-skill flat linking for Pi / Skills.sh compatibility.

### Security hardening

| Class | Fix |
|---|---|
| **RCE (template-literal injection)** | `emitCommandHandler` uses plain string + arg-array `execSync`; no shell template literals, no `shell:true`. Structurally eliminated — not patched per adapter. |
| **Path traversal — plugin name** | `sanitizeName()` rejects `..`/absolute/non-kebab at `addPluginFromSource` install time. |
| **Path traversal — `nativeCopies` from/to** | `sanitizeJoin()` validates both src and dst paths resolve inside the plugin root in `build` command. |
| **Path traversal — SKILL.md frontmatter** | `sanitizeName()` applied to `name:` field from `SKILL.md` frontmatter before any symlink/write. |
| **Path traversal — `adapterOverrides` / handler `source`** | `sanitizeJoin(pluginRoot, path)` applied at compile time; runtime trust warning emitted. |
| **SSRF bypass** | `safe-fetch` re-validates every redirect hop against allow-list + private-IP check. |
| **Arbitrary script execution at install** | `evaluateScriptPolicy()` runs on `add` / `import --write`; denylisted lifecycle scripts block the install. |
| **Integrity never verified** | `verifyIntegrity()` called on install when `manifest.integrity` is declared. |
| **Git clone URL injection** | `cloneRepo` validates `https://github.com/...` before URL interpolation. |
| **Symlink clobber** | `unlinkSync` only; `rmSync` never on user dirs; `lstatSync` guard. |
| **Install idempotency** | `unlinkAll()` factors pre-delete for compiled + skills + native + symlink artifacts; stale links never left behind. |
| **Silent partial installs** | Symlink failures collected, warned at summary, `process.exitCode=1`. |

### Bug fixes

- `subagentStop` collision fixed; dead `agentCommand`/`agentCwd` passthrough removed.
- `sidecar` marked experimental (`x-experimental`) in schema and docs.
- `recompile-installed` dogfood script moved from `cli/src/commands/` → `scripts/`.
- Two OpenCode test failures (stale `Bun.$` assertions) corrected to `execSync (curl)`.
- Example logger `package.json` no longer carries a version field in its internal manifest.
- CLI version read from `package.json` instead of hardcoded string.

### Breaking changes

- **`spawnChild`** removed from `@agentplugins/compile` and `@agentplugins/core`. It had zero callers; no adapter used it. Any external consumer importing it directly will break — the replacement is to use `node:child_process.spawn` directly with sandboxing.
- **`@agentplugins/contract`** is a new published package. Its API (`PluginManifest` zod schema, derived types, `manifest.schema.json`) is stable from this release. `core` re-exports remain the preferred consumer entry.

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
