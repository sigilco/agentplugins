# OpenCode `Tier-1`

Open-source agent harness. No JSON manifest — plugins are npm packages or `.ts/.js` files registered in `opencode.json`.

- Docs: <https://opencode.ai/docs/en/plugins/>
- Manifest: none (registered in `opencode.json` or auto-discovered)
- Components: hooks, tools, auth, providers, chat/message hooks, shell.env
- Key hooks: event, tool.execute.before/after, shell.env, chat.params, chat.headers, permission.ask
- Install: `~/.config/opencode/plugins/`, `.opencode/plugins/`, or npm
