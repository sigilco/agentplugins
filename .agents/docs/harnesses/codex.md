# Codex `Tier-1`

OpenAI's agent harness. Plugins use `.codex-plugin/` with a JSON manifest.

- Docs: <https://developers.openai.com/codex/plugins>
- Manifest: `.codex-plugin/plugin.json`
- Components: skills, hooks, mcpServers, apps
- Hooks: `hooks/hooks.json`; MCP: `.mcp.json`; Apps: `.app.json`
- Key hooks: SessionStart, SubagentStart, PreToolUse, PermissionRequest, PostToolUse, SubagentStop, Stop
- Distribution: marketplace JSON (`~/.agents/plugins/marketplace.json` or repo-scoped)
