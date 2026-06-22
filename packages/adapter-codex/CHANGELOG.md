# @agentplugins/adapter-codex

## 0.1.0

### Minor Changes

- bce92e4: Initial public release of AgentPlugins

  This is the first public release of AgentPlugins, a unified plugin library for AI agent harnesses. Write your plugins once and compile them for multiple platforms:

  - **@agentplugins/core** - Core types, validation, registry, and hook-wrapper generator
  - **@agentplugins/cli** - Build/validate/init commands for compiling plugins
  - **Adapters** - Platform-specific adapters for Claude Code, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono

  ## Getting Started

  ```bash
  # Install the CLI
  npm install -g @agentplugins/cli

  # Initialize a new plugin
  agentplugins init my-plugin

  # Build for all platforms
  agentplugins build

  # Build for specific platform
  agentplugins build --platform claude
  ```

### Patch Changes

- Updated dependencies [bce92e4]
  - @agentplugins/core@0.1.0
