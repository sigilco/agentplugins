# AgentPlugins: Plugin Manager for AI Agent Harnesses

## Overview

AgentPlugins solves the distribution problem in AI agent plugin development. Today, plugin developers must either maintain N separate codebases for N platforms (Claude Code, OpenCode, Codex, Copilot, Gemini, Kimi, Pi Mono, …) or build a universal compiler. We took the latter path in v0.1.0. In v0.2.0, we pivot to the **distribution problem**: the highest-value thing a CLI can do for a user is install a plugin **once** and have it show up in **every agent harness** they use.

```
plugin source  ──→  agentplugins CLI  ──→  ~/.agents/plugins/<name>/
                                            ├─→ ~/.claude/skills/<name>     (symlink)
                                            ├─→ ~/.codex/skills/<name>      (symlink)
                                            ├─→ ~/.opencode/skills/<name>   (symlink)
                                            ├─→ ~/.kimi/skills/<name>       (symlink)
                                            ├─→ ~/.gemini/skills/<name>     (symlink)
                                            ├─→ ~/.copilot/skills/<name>    (symlink)
                                            └─→ ~/.pi/extensions/<name>     (symlink)
```

Codegen (`agentplugins build`) remains a power-user feature, not the headline. The headline is `**agentplugins add <github-url>**`.

## Strategic Decisions (Locked)


| Decision         | Choice                              | Rationale                                                                                                                               |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Build target     | **Bun compile only**                | Drop Node SEA (too experimental). Bun is 50MB, 30ms startup, 8 cross-compile targets, used in prod by Sentry/Discord/Anthropic/Shopify. |
| Rewrite target   | **Drop Rust**                       | Distribution problem is fetch/symlink/parse JSON — doesn't need Rust. Saves 7-9 weeks. Defer to v2+ if demanded.                        |
| Adapter ABI      | **JSON process ABI**                | Any-language adapter = a binary that reads JSON, writes files, exits 0/non-0. No SDK lock-in.                                           |
| Manifest format  | **JSON + JSON Schema from day one** | `@agentplugins/schema` npm package + hosted URL. Editor autocomplete + self-documenting.                                                |
| Primary platform | **macOS + Linux (glibc + musl)**    | Bun compile supports both natively. Windows best-effort.                                                                                |
| Skills.sh compat | **Adopt as a subset**               | Our `SKILL.md` is a valid Skills.sh skill. Their repos install in our CLI.                                                              |
| Universal store  | `~/.agents/plugins/<name>/`         | Symlinks fan out to per-agent paths. Mirrors Skills.sh layout.                                                                          |


## Distribution Channels (Day Zero)


| #   | Channel           | Artifact                                          | Command                                                    |
| --- | ----------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **Native binary** | GitHub Releases (8 targets via Bun compile)       | `agentplugins add <url>`                                   |
| 2   | **npm**           | `@agentplugins/cli` with 200-byte `bin` wrapper   | `npx @agentplugins/cli add <url>`                          |
| 3   | **Homebrew**      | `sigilco/tap` repo, `agentplugins.rb` formula     | `brew install sigilco/tap/agentplugins`                    |
| 4   | **Curl**          | `install.sh` with SHA256 + OS/arch detection      | `curl -fsSL https://agentplugins.dev/install.sh | sh`      |
| 5   | **Mise**          | UBI backend (day one) + core plugin (post v0.2.0) | `agentplugins = "ubi:sigilco/agentplugins"` in `mise.toml` |


The user picks the channel that fits their workflow. All five ship at v0.2.0.

## Architecture

### Stages

#### Stage 1 — Distribution MVP (v0.2.0, ~1-2 weeks)

- `add/remove/list/update/info/doctor` subcommands
- `~/.agents/plugins/` universal store + symlink fanout
- Agent path registry (`spec/v1/agent-paths.json`)
- Skills.sh compatibility (read `SKILL.md`, scan `~/.agents/skills/`)
- Bun compile → 8 target binaries → GitHub Releases
- `@agentplugins/cli` npm package
- Homebrew tap `sigilco/tap`
- `install.sh` curl script
- Mise UBI channel
- `@agentplugins/schema` package + hosted JSON Schema

#### Stage 2 — Spec + Conformance (v0.3.0, ~2 weeks)

- JSON Schema finalized for v1 (skills, mcpServers, hooks, tools, commands, agents, rules, lspServers)
- Ajv validation in CLI (offline-capable)
- `agentplugins init` scaffolds a plugin
- Conformance test suite (fixture → expected output per adapter)
- Mise core plugin in `sigilco/mise-agentplugins`
- Schema docs site (`spec/v1/README.md`)

#### Stage 3 — Adapter SDK + Codegen (v0.4.0, ~3 weeks)

- JSON process ABI spec (`spec/v1/adapter.schema.json`)
- Adapter SDK in TS (helper library, not a hard requirement)
- Refactor 7 canonical adapters to use the SDK
- Hooks codegen per target (lifecycle event mapping)
- MCP codegen per target
- Codegen v2: replaced the v0.1.0 monolithic build with a per-component pipeline

#### Stage 4 — Full Coverage + Public Launch (v1.0.0, ~4 weeks)

- All 7 canonical adapters fully tested
- Public launch (registry, docs site, examples)
- Security warning at install time (deferred to v1: Gen/Socket/Snyk scoring)
- Deprecation of v0.1.0 monolithic `agentplugins build` in favor of v0.4.0 per-component pipeline

## Deliverables

- `agentplugins` Bun-compiled CLI binary (8 targets)
- `@agentplugins/cli`, `@agentplugins/core`, `@agentplugins/schema` on npm
- `@agentplugins/adapter-{claude,codex,copilot,gemini,kimi,opencode,pimono,mcp}` on npm
- `sigilco/homebrew-tap` repo with `agentplugins.rb` formula
- `sigilco/mise-agentplugins` repo (post v0.2.0)
- `spec/v1/manifest.schema.json` published to npm + hosted at `agentplugins.dev/schema/v1.json`
- `scripts/install.sh` curl installer at `agentplugins.dev/install.sh`
- **VitePress landing page** at `https://sigilco.github.io/agentplugins` (deployed via GitHub Pages)
- README with 5 install methods side-by-side
- 2 example plugins: `agentplugins-example-logger`, `agentplugins-example-profiler`

## Landing Page (VitePress)

The public site is the first impression. **VitePress** for:

- Vite-powered (fast HMR, fast builds, ~10s build for 100 pages)
- Vue 3 theming (no new framework to learn)
- Markdown-first content (matches our existing `docs/` style)
- Built-in: search, sidebar, nav, dark mode, prev/next, i18n
- Static HTML output → deploys anywhere (GH Pages, Vercel, Netlify, S3)

Hosted as a **GitHub Pages project page** at `https://sigilco.github.io/agentplugins`. Custom domain `agentplugins.dev` deferred to v1.0.

### Site structure

```
docs-site/
├── package.json
├── .vitepress/
│   ├── config.ts        # nav + sidebar config
│   └── theme/           # custom theme (default is fine for v1)
├── index.md             # hero + 5 install methods
├── guide/
│   ├── getting-started.md
│   ├── install.md       # 5 install channels side-by-side
│   ├── quick-tour.md
│   └── faq.md
├── reference/
│   ├── manifest-schema.md
│   ├── adapter-abi.md
│   ├── agent-paths.md
│   └── cli.md
├── adapters/
│   ├── claude.md
│   ├── codex.md
│   ├── copilot.md
│   ├── gemini.md
│   ├── kimi.md
│   ├── opencode.md
│   └── pimono.md
├── distribution/
│   ├── channels.md
│   ├── universal-store.md
│   └── skills-sh-compat.md
└── public/
    └── logo.svg
```

### Deployment

- `.github/workflows/docs.yml` builds on push to `main` (when `docs-site/**` changes)
- Uses `actions/deploy-pages@v4`
- Repo Settings → Pages → Build from GitHub Actions
- Custom domain `agentplugins.dev` deferred

## Naming Conventions (Locked)

Consistent across the whole app, no exceptions:


| Surface              | Value                                                    | Why                                           |
| -------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Product display name | `AgentPlugins`                                           | PascalCase, used in titles, hero text, README |
| npm scope            | `@agentplugins/*`                                        | matches existing 8 packages                   |
| CLI binary           | `agentplugins`                                           | lowercase, used in `npx`, `brew`, `curl | sh` |
| CLI display          | `AgentPlugins CLI`                                       | header text, `--help`                         |
| Config file          | `agentplugins.config.ts`                                 | `init` scaffolds this filename                |
| Universal store      | `~/.agents/plugins/[[ORCA_RAW_HTML_INLINE:%3Cname%3E]]/` | unchanged                                     |
| GitHub repo          | `sigilco/agentplugins`                                   | sigilco org                                   |
| GitHub Pages         | `sigilco.github.io/agentplugins`                         | project page                                  |
| Homebrew tap         | `sigilco/homebrew-tap` → `agentplugins.rb`               | formula name                                  |
| Mise plugin          | `sigilco/mise-agentplugins`                              | post v0.2.0                                   |
| Domain (future)      | `agentplugins.dev`                                       | matches binary name                           |
| JSON Schema          | `https://agentplugins.dev/schema/v1.json`                | matches domain                                |
| Codegen output       | `agentplugins.config.json` (future)                      | if we ever drop TS configs                    |


## Why This Beats the v0.1.0 Direction

The v0.1.0 plan (monorepo + 7 TS adapters + codegen) is still the **right back-end architecture**. What changed is the **front-door value proposition**:


| v0.1.0 framing                          | v0.2.0 framing                                                    |
| --------------------------------------- | ----------------------------------------------------------------- |
| "Write once, compile to 7 platforms"    | "Install once, works in every agent"                              |
| Power user (plugin author)              | Daily user (plugin consumer)                                      |
| `agentplugins build` is the hero        | `agentplugins add [[ORCA_RAW_HTML_INLINE:%3Curl%3E]]` is the hero |
| 7 adapter repos + codegen = the surface | 1 universal store + symlinks = the surface                        |
| Distribution is an afterthought         | Distribution is the product                                       |
| TS-only                                 | Skills.sh-compatible (TS/JSON/Markdown)                           |


Codegen is still useful for plugin authors who want to maintain one source-of-truth manifest. But the v0.1.0 codegen is a single-output back-end. The v0.2.0 distribution layer is the front-end. They're complementary, not replacements.

## Open Decisions (User Input Needed)

1. **Project name**: `unplugin-agent-plugin` (repo) vs `@agentplugins/*` (npm) — reconcile. **Recommendation**: rename to `agentplugins` before v0.2.0 tags.
2. **Domain**: `agentplugins.dev` (matches repo) vs `agentplugins.dev` (matches new name).
3. **Windows**: best-effort (`bun-windows-*` targets) or skip?
4. **Mise core plugin timing**: ship at v0.2.0 or v0.3.0?
5. **JSON-only manifest or YAML/TOML too?**: **Recommendation**: JSON-only at v0.2.0.

Implementation details and per-milestone tasks are tracked in the GitHub issue tracker: [Project 14](https://github.com/users/espetro/projects/14/views/1).