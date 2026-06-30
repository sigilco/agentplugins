---
name: migrate-plugins
description: Migrate community plugins from Claude Code, Codex, or Skills.sh into AgentPlugins. Use when the user wants to convert a plugin they wrote or found into the AgentPlugins v1 manifest format so it can be installed via `agentplugins add` or `agentplugins import`.
---

# Migrating community plugins into AgentPlugins

This skill drives the **hybrid migration workflow** for community plugins. It combines a deterministic `@agentplugins/ingest` package with a conversational `@agentplugins/migrate` MCP server so agents can handle both routine and lossy migrations with human-in-the-loop review.

## When to use this skill

Trigger this skill when the user asks any of:

- "migrate this Claude Code plugin to AgentPlugins"
- "convert this Skills.sh skill folder"
- "port this Codex plugin"
- "make this Claude plugin work with agentplugins add"
- "translate plugin.json into an AgentPlugins manifest"

Do NOT trigger this skill for plugins written natively in OpenCode or Pi — those ecosystems ship TypeScript modules with hook/tool registrations inside function bodies, and TS AST parsing is too brittle for v0.3.0. Refuse and recommend rewriting the plugin directly against AgentPlugins v1.

## Decision tree

```
Is the source a directory you can read?
├── no  → refuse: "I cannot migrate a plugin I cannot read."
└── yes
    │
    ├── Can you identify the source format?
    │   ├── .claude-plugin/plugin.json exists    → format = claude-code
    │   ├── .codex-plugin/plugin.json exists     → format = codex
    │   ├── SKILL.md or skill.md present         → format = skills-sh
    │   ├── package.json + TS with hook calls    → REFUSE: OpenCode/Pi
    │   └── none of the above                    → ask the user to identify it
    │
    ├── Is the plugin one of the "out-of-scope" patterns?
    │   ├── Persistent HTTP server at host boot  → refuse (arch-gap)
    │   ├── Ships a binary blob with no manifest → refuse (OOS)
    │   ├── Patches the agent harness source     → refuse (OOS)
    │   ├── UI-only (statusline, TUI)            → refuse (OOS)
    │   ├── Multi-agent orchestrator             → refuse (OOS)
    │   └── Otherwise                            → continue
    │
    └── Run the migration:
        1. Call `scan` on the source directory.
        2. If format is unambiguous, call `convert` with that format.
        3. If format is ambiguous, ask the user.
        4. Review the manifest + warnings returned by `convert`.
        5. If warnings exist, surface them to the user with `diff_manifest`.
        6. Walk the user through each warning. For each one, decide:
           - accept the lossy translation (default for "dropped-field" warnings)
           - recover the field manually (for fields that matter)
           - refuse to migrate (e.g. if the plugin depends on hook return values
             that AgentPlugins v1 discards)
        7. Call `verify_integrity` on the source to record the SHA-256.
        8. Call `write_manifest` to persist the result.
        9. Tell the user to run `agentplugins import <format> <source>` (or
           `agentplugins add <github-url>` for the published repo).
```

## Refusal prompts

Use these verbatim when you need to refuse or escalate. They are written in the agent voice and can be lifted as-is.

### OpenCode / Pi TS plugins

> I can see this is an OpenCode/Pi plugin (TypeScript module with `experimental.chat.messages.transform`-style hook registrations). AgentPlugins v0.3.0 cannot deterministically migrate TS plugins — the hook surface lives inside function bodies and an AST import would be too brittle to trust. I can help you rewrite it directly against the AgentPlugins v1 manifest instead. Want me to scaffold the equivalent `.claude-plugin/plugin.json` + `agentplugins.config.ts`?

### Persistent HTTP server

> This plugin starts a persistent HTTP server at host boot (e.g. `opencode-ensemble`, `opencode-mem`). AgentPlugins treats plugins as on-demand, not daemons. Migrating this would require a `sidecar` declaration, but the security model still assumes sidecars are started and stopped with the agent session. I'd recommend either packaging this as a separate service the user runs themselves, or rewriting the agent-facing surface as a Skill that calls the running service over HTTP.

### Hook return-value dependency

> The plugin's `PreToolUse` handler returns `{ decision: "block", reason: "..." }` to refuse tool calls in Claude Code. AgentPlugins v1 handlers are fire-and-forget — the return value is discarded. Migrating this would silently change behavior: tools that should be blocked will run. I'd recommend keeping this on the native Claude adapter and using `targets: ["claude"]` in the manifest so it doesn't try to cross-compile.

### Missing manifest

> I don't see a `.claude-plugin/plugin.json` (or `.codex-plugin/plugin.json`, or `SKILL.md`) in this directory. I can scan the directory for hints — let me run the `scan` tool first to see what we can identify.

### Auth provider or externalBinary

> The plugin declares an `auth` provider (or `externalBinary`). Neither field exists in AgentPlugins v1. We're tracking them as v2 candidates. For now, the plugin can declare its API key requirement via `userConfig` and ship a wrapper script under `commands/`. Let me show you what that would look like.

## Format-specific notes

### Claude Code → AgentPlugins

- **Required input:** `.claude-plugin/plugin.json`
- **Auto-imported:** `commands/` (markdown), `hooks/hooks.json` (legacy), per-event `hooks/<name>.json`, `.mcp.json`
- **Dropped:** `agents/*.md` subagents, `settings.local.json`, `experimental.chat.*` hooks
- **Common warnings:**
  - `dropped-field` — surface preserved under `metadata._dropped`
  - `unsupported-hook-return` — `PreToolUse`, `UserPromptSubmit`, `PreCompact` return values are discarded
  - `dropped-dependency` — `package.json` `dependencies` are NOT carried into `manifest.dependencies`; re-declare them after migration

### Codex → AgentPlugins

- **Required input:** `.codex-plugin/plugin.json`
- **Auto-imported:** `hooks.json` (single file), `.mcp.json`
- **Dropped:** `agents.md` (use the MCP server's `convert` + manual edit to recover)
- **Common warnings:**
  - `codex-agents-not-mapped` — agents.md is not auto-imported
  - `unsupported-hook-return` — same as Claude Code

### Skills.sh → AgentPlugins

- **Required input:** A directory containing `SKILL.md` (or `skill.md`) at any level
- **Auto-imported:** Every `SKILL.md` becomes one entry in `manifest.skills[]`
- **Plugin-level metadata:** synthesized from the root `SKILL.md` frontmatter (or the directory name as a fallback)
- **Common warnings:**
  - `no-skills-md` — no SKILL.md found anywhere
  - `dropped-field` — frontmatter keys we don't model (preserve them or strip them)

## After the migration

Once the manifest is written:

```bash
# Verify the result locally
agentplugins validate --config ./agentplugins.imported.json

# Install it (CLI ingestor path)
agentplugins import claude-code /path/to/source --write

# Or push it to a repo and install from there
agentplugins add https://github.com/you/migrated-plugin
```

## Examples

### Migrating `ComposioHQ/awesome-claude-plugins/frontend-design`

```text
scan → recognized formats: [claude-code]
convert → manifest.name = "frontend-design", description = "...",
          warnings = [], vendorFiles = [...]
verify_integrity → sha256:abc... (record for the manifest)
write_manifest → /path/to/frontend-design/agentplugins.imported.json
```

### Migrating a Skills.sh folder with 3 sub-skills

```text
scan → recognized formats: [skills-sh]
convert → manifest.name = "my-toolkit", skills = [
            { name: "lint", description: "...", filePath: "lint/SKILL.md" },
            { name: "format", description: "...", filePath: "format/SKILL.md" },
            { name: "deploy", description: "...", filePath: "deploy/SKILL.md" }
          ],
          warnings = []
write_manifest → ...
```

## When in doubt

If you are unsure whether to migrate, refuse, or escalate, prefer refusing with a clear reason. Migrations that silently change behavior are worse than no migration at all.
