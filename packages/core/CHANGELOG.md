# @agentplugin/core

## 0.1.0

### Minor Changes

- bce92e4: Initial public release of AgentBridge

  This is the first public release of AgentBridge, a unified plugin library for AI agent harnesses. Write your plugins once and compile them for multiple platforms:

  - **@agentplugin/core** - Core types, validation, registry, and hook-wrapper generator
  - **@agentplugin/cli** - Build/validate/init commands for compiling plugins
  - **Adapters** - Platform-specific adapters for Claude Code, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono

  ## Getting Started

  ```bash
  # Install the CLI
  npm install -g @agentplugin/cli

  # Initialize a new plugin
  agentbridge init my-plugin

  # Build for all platforms
  agentbridge build

  # Build for specific platform
  agentbridge build --platform claude
  ```
