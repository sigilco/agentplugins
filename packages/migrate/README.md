# @agentplugins/migrate

MCP server that exposes AgentPlugins migration tools to any MCP-compatible agent.

## Tools

| Name              | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `scan`            | Probe a source directory and list which ingest formats recognize it.        |
| `convert`         | Run an ingestor and return the synthesized manifest + warnings + schema.   |
| `write_manifest`  | Write a manifest to disk (refuses to overwrite unless `overwrite: true`).   |
| `diff_manifest`   | Diff two manifests field-by-field (top-level).                              |
| `verify_integrity`| Compute SHA-256 over a source tree and verify against a known integrity.    |

All tools accept JSON input validated with `zod` and return JSON output. The server does NOT execute any code from the migrated source — agents must review the returned manifest before writing or installing.

## Usage from an MCP client

```json
{
  "method": "tools/call",
  "params": {
    "name": "convert",
    "arguments": {
      "format": "claude-code",
      "source": "/path/to/claude-plugin"
    }
  }
}
```

The agent receives:

```json
{
  "manifest": { "name": "demo", "version": "1.0.0", "description": "...", "commands": [...] },
  "warnings": [{ "code": "unsupported-hook-return", "severity": "warning", "message": "..." }],
  "vendorFiles": [{ "relativePath": "commands/hello.md", "reason": "Claude Code command markdown" }],
  "schema": { "valid": true, "errors": [] }
}
```

The agent can then call `diff_manifest` against the original (if available), edit the manifest in conversation, and call `write_manifest` to persist the result.

## Usage from the CLI

The MCP server is launched over stdio. To expose it to an MCP-capable client, register it in the client's MCP configuration:

```json
{
  "mcpServers": {
    "agentplugins-migrate": {
      "command": "npx",
      "args": ["-y", "@agentplugins/migrate"]
    }
  }
}
```

Or run it locally during development:

```bash
pnpm --filter @agentplugins/migrate build
node packages/migrate/dist/index.js
```

## Hybrid migration workflow

The agent-first workflow combines this MCP server with the deterministic `@agentplugins/ingest` package and a `SKILL.md` (in the repo root) that gives the agent a decision tree:

1. **scan** — identify the source format.
2. **convert** — get the deterministic baseline manifest.
3. **diff_manifest** — show the user what changed.
4. **edit** — the agent edits the manifest in conversation (e.g. fills in fields the ingestor dropped).
5. **verify_integrity** — hash the source tree.
6. **write_manifest** — persist the final manifest.
7. **install** — the user runs `agentplugins add /path/to/converted-plugin` (or `agentplugins import --write`).

## License

MIT
