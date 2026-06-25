# @agentplugins/ingest

Format ingestors for importing community plugins from **Claude Code**, **Codex**, and **Skills.sh** into AgentPlugins v1 manifests.

## When to use

Use this package when you want a deterministic, code-only translation of an upstream plugin source tree into an AgentPlugins manifest. The output includes a translated manifest, a list of files that should be vendored (copied) into the generated plugin, and structured warnings about fields that have no v1 representation.

For lossy or bespoke migrations, use the `@agentplugins/migrate` MCP server instead — it lets an agent read the source, call the ingestor, ask follow-up questions, and produce a richer result.

## Quick start

```ts
import { ingest } from '@agentplugins/ingest';

const result = ingest('claude-code', '/path/to/claude/plugin');

console.log(result.manifest);    // AgentPlugins v1 manifest (Record<string, unknown>)
console.log(result.warnings);    // IngestWarning[]
console.log(result.vendorFiles); // files to copy into the plugin dir
```

## Per-format entry points

```ts
import { ingestClaudeCode, ingestCodex, ingestSkillsSh } from '@agentplugins/ingest';

ingestClaudeCode('/path/to/claude-plugin');
ingestCodex('/path/to/codex-plugin');
ingestSkillsSh('/path/to/skills-sh-dir');
```

## Warnings

Every ingestor returns warnings instead of throwing on lossy translations. Warnings carry:

| field         | type                                    | meaning                                       |
| ------------- | --------------------------------------- | --------------------------------------------- |
| `code`        | `string`                                | stable identifier, e.g. `dropped-field`      |
| `severity`    | `'info' \| 'warning' \| 'error'`        | triage hint                                   |
| `message`     | `string`                                | human-readable explanation                    |
| `sourcePath`  | `string?`                               | upstream file that triggered the warning      |
| `field`       | `string?`                               | manifest field (dotted path)                  |
| `suggestion`  | `string?`                               | suggested next step                           |

Filter warnings by `code` to suppress or upgrade specific issues (e.g. fail CI on `dropped-dependency`).

## What is vendored

The `vendorFiles` list contains `{ absolutePath, relativePath, reason }` records for every upstream file the install step must copy into the generated plugin. Typical reasons:

- `Claude Code command markdown`
- `Claude Code hooks config`
- `Claude Code MCP server registry`
- `Skills.sh skill content`

The install step (currently the `agentplugins import <format> <source>` CLI command) is responsible for copying these files. The ingestor itself never writes to disk.

## Format-specific notes

### Claude Code (`.claude-plugin/plugin.json`)

- Required file: `.claude-plugin/plugin.json`
- Reads `commands/`, `hooks/hooks.json`, per-event hook files, and `.mcp.json`
- Pascal-case hook names (`PreToolUse`) are mapped to camelCase (`preToolUse`)
- Subagents (`agents/*.md`) and `settings.local.json` are not auto-imported

### Codex (`.codex-plugin/plugin.json`)

- Required file: `.codex-plugin/plugin.json`
- Reads `hooks.json` (single file) and `.mcp.json`
- Snake-case hook names (`pre_tool_use`) are mapped to camelCase (`preToolUse`)

### Skills.sh (`SKILL.md` trees)

- No manifest file; the plugin name comes from the directory name or the root SKILL.md frontmatter
- Each `SKILL.md` (or `skill.md`) becomes one entry in `manifest.skills`
- YAML frontmatter is parsed with [`gray-matter`](https://github.com/jonschlinkert/gray-matter)

## License

MIT
