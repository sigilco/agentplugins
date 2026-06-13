# @agentplugin/adapter-gemini

## 0.1.0

### Minor Changes

- bce92e4: Initial public release of AgentPlugin

  This is the first public release of AgentPlugin, a unified plugin library for AI agent harnesses. Write your plugins once and compile them for multiple platforms:

  - **@agentplugin/core** - Core types, validation, registry, and hook-wrapper generator
  - **@agentplugin/cli** - Build/validate/init commands for compiling plugins
  - **Adapters** - Platform-specific adapters for Claude Code, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono

  ## Getting Started

  ```bash
  # Install the CLI
  npm install -g @agentplugin/cli

  # Initialize a new plugin
  agentplugin init my-plugin

  # Build for all platforms
  agentplugin build

  # Build for specific platform
  agentplugin build --platform claude
  ```

### Patch Changes

- Updated dependencies [bce92e4]
  - @agentplugin/core@0.1.0
