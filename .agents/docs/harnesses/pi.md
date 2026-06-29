# Pi Mono `Tier-1`

Open-source agent harness from Eärendil Works. Extensions are npm packages or standalone `.ts` files.

- Repo: <https://github.com/earendil-works/pi>
- Manifest: `package.json` with `"pi"` key, or single `.ts` files auto-discovered
- Components: extensions, skills, prompts, themes, tools, commands, shortcuts, flags, providers
- Key events: session_start, session_shutdown, before_agent_start, agent_start, turn_start, input, tool_call, tool_result
- Install: `~/.pi/agent/extensions/`, `.pi/extensions/`, npm packages, `pi install`
