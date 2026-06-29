# Gemini CLI `Tier-2`

Google's agent harness. Extensions use a `gemini-extension.json` manifest.

- Docs: <https://geminicli.com/docs/extensions/>
- Manifest: `gemini-extension.json`
- Components: mcpServers, context (GEMINI.md), skills, hooks, themes, settings, plan directory
- Hooks: `hooks/hooks.json`
- Key hooks: SessionStart, SessionEnd, BeforeAgent, AfterAgent, BeforeModel, AfterModel, BeforeTool, AfterTool
- Install: `~/.gemini/extensions/` via `gemini extensions install`
