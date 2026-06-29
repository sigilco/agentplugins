# GitHub Copilot `Tier-2`

GitHub's agent harness. Accepts multiple manifest paths for compat.

- Docs: <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating>
- Manifest: `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json`, or `.claude-plugin/plugin.json`
- Components: agents, skills, commands, hooks, mcpServers, lspServers
- Hooks: `hooks.json` or `hooks/hooks.json`; MCP: `.mcp.json`
- Key hooks: sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse, agentStop, subagentStart, subagentStop
- Install: `~/.copilot/installed-plugins/`
