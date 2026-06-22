# Installation via mise

[mise](https://mise.jdx.dev/) is a polyglot tool version manager. AgentPlugins
supports installation via the [UBI backend](https://github.com/jdx/mise-ubi),
which auto-fetches pre-built binaries from GitHub Releases.

## Quick start

```sh
# Install globally (available in all projects)
mise use -g ubi:sigilco/agentplugins

# Verify
agentplugins --version
```

## Per-project (mise.toml)

Create or add to `mise.toml` in your project root:

```toml
[tools]
agentplugins = "ubi:sigilco/agentplugins"
```

Then run `mise install` to install.

## Pinning a version

```sh
# Pin to a specific version
mise use -g ubi:sigilco/agentplugins@0.2.0
```

```toml
# mise.toml
[tools]
agentplugins = "ubi:sigilco/agentplugins@0.2.0"
```

## How it works

The UBI backend reads the latest GitHub Release from `sigilco/agentplugins`,
detects your OS and architecture, downloads the matching tarball, verifies
the SHA256 checksum, and places the binary on your PATH.

Supported targets:
- `darwin-arm64` (Apple Silicon)
- `darwin-x64` (Intel Macs)
- `linux-arm64`
- `linux-x64`

## Updating

```sh
mise upgrade agentplugins
# or
mise install agentplugins@latest
```

## Future: mise core plugin

A dedicated mise core plugin (with `list-all`, `latest`, and custom install
logic) is planned for a future release. Until then, the UBI backend provides
full functionality.
