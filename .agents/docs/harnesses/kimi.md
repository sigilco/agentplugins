# Kimi `Tier-2`

Moonshot AI's agent harness. Plugins use `kimi.plugin.json` or `.kimi-plugin/plugin.json`.

- Docs: <https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html>
- Manifest: `kimi.plugin.json` or `.kimi-plugin/plugin.json`
- Components: skills (`skills/<name>/SKILL.md`), mcpServers, hooks (in user `config.toml`)
- Key hooks: UserPromptSubmit, PreToolUse, Stop (blockable); SessionStart, SessionEnd, SubagentStart, SubagentStop, Notification (observation)
- Install: `~/.kimi-code/plugins/managed/<id>/` via `/plugins install <github-url>`
