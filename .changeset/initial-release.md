---
"@agentbridge/core": minor
"@agentbridge/cli": minor
"@agentbridge/adapter-claude": minor
"@agentbridge/adapter-codex": minor
"@agentbridge/adapter-copilot": minor
"@agentbridge/adapter-gemini": minor
"@agentbridge/adapter-kimi": minor
"@agentbridge/adapter-opencode": minor
"@agentbridge/adapter-pimono": minor
---

Initial public release of AgentBridge

This is the first public release of AgentBridge, a unified plugin library for AI agent harnesses. Write your plugins once and compile them for multiple platforms:

- **@agentbridge/core** - Core types, validation, registry, and hook-wrapper generator
- **@agentbridge/cli** - Build/validate/init commands for compiling plugins
- **Adapters** - Platform-specific adapters for Claude Code, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono

## Getting Started

```bash
# Install the CLI
npm install -g @agentbridge/cli

# Initialize a new plugin
agentbridge init my-plugin

# Build for all platforms
agentbridge build

# Build for specific platform
agentbridge build --platform claude
```
