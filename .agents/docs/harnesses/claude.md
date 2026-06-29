# Claude Code `Tier-1`

Anthropic's agent harness. Plugins ship as `.claude-plugin/` directories with a JSON manifest.

- Docs: <https://code.claude.com/docs/en/plugins-reference>
- Manifest: `.claude-plugin/plugin.json`
- Components: skills (`skills/<name>/SKILL.md`), commands, agents, hooks, mcpServers, lspServers, monitors (experimental)
- Hooks: `hooks/hooks.json`
- Key hooks: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStart, SubagentStop, Stop
- Install: `~/.claude/skills/` (dev), `~/.claude/plugins/cache/` (marketplace)
