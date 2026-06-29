# @agentplugins/store

Universal plugin store for AgentPlugins — manages `~/.agents/plugins/<name>/`.
Clones plugins from GitHub, symlinks them into every detected agent harness,
and is Skills.sh compatible (reads `SKILL.md`, scans `~/.agents/skills/`).

Extracted from `@agentplugins/core` in v0.5.0. `@agentplugins/core` re-exports
this package's public API — most consumers should import from `@agentplugins/core`
rather than reaching for `@agentplugins/store` directly.
