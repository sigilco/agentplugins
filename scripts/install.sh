#!/usr/bin/env bash
#
# install.sh — Install AgentPlugins CLI via curl
#
# Usage:
#   curl -fsSL https://agentplugins.pages.dev/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/sigilco/agentplugins/main/scripts/install.sh | bash
#
# Flags:
#   --version <ver>    Specific version (default: latest)
#   --bin-dir <dir>    Installation directory (default: /usr/local/bin or ~/.local/bin)
#   --dry-run          Print actions without executing
#
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

REPO="sigilco/agentplugins"
INSTALL_NAME="agentplugins"
VERSION="latest"
BIN_DIR=""
DRY_RUN=false

# ─── Helpers ─────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34mℹ\033[0m  %s\n' "$*" >&2; }
log()   { printf '\033[1;32m✓\033[0m %s\n' "$*" >&2; }
err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# ─── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)  VERSION="$2"; shift 2 ;;
    --bin-dir)  BIN_DIR="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -h|--help)
      echo "Usage: curl -fsSL ...install.sh | bash -s -- [--version <ver>] [--bin-dir <dir>] [--dry-run]"
      exit 0 ;;
    *) err "Unknown flag: $1"; exit 1 ;;
  esac
done

# ─── Detect platform ─────────────────────────────────────────────────────────

detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *) err "Unsupported OS: $os"; exit 1 ;;
  esac

  case "$arch" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) err "Unsupported architecture: $arch"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

PLATFORM="$(detect_platform)"
info "Detected platform: $PLATFORM"

# ─── Determine install directory ─────────────────────────────────────────────

if [[ -z "$BIN_DIR" ]]; then
  if [[ -w "/usr/local/bin" ]]; then
    BIN_DIR="/usr/local/bin"
  elif [[ -d "$HOME/.local/bin" ]] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
    BIN_DIR="$HOME/.local/bin"
    # Warn about PATH
    case ":$PATH:" in
      *":$BIN_DIR:"*) ;;
      *)
        info "$BIN_DIR is not in your PATH."
        info "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        info '  export PATH="$HOME/.local/bin:$PATH"'
    esac
  else
    err "Could not find a writable install directory. Use --bin-dir <dir>."
    exit 1
  fi
fi

info "Install directory: $BIN_DIR"

# ─── Resolve version ─────────────────────────────────────────────────────────

resolve_version() {
  local v="$1"
  if [[ "$v" == "latest" ]]; then
    # Query GitHub API for latest tag
    local latest
    latest="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep '"tag_name"' \
      | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
      || true)"
    if [[ -z "$latest" ]]; then
      err "Could not determine latest version. Use --version <ver>."
      exit 1
    fi
    echo "${latest#v}"
  else
    echo "${v#v}"
  fi
}

RESOLVED_VERSION="$(resolve_version "$VERSION")"
info "Version: $RESOLVED_VERSION"

# ─── Determine download URL ──────────────────────────────────────────────────

# Try the tarball first, fall back to raw binary
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${RESOLVED_VERSION}/agentplugins-${PLATFORM}.tar.gz"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${RESOLVED_VERSION}/checksums-sha256.txt"
BINARY_NAME="agentplugins-${PLATFORM}"

# ─── Download ────────────────────────────────────────────────────────────────

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t agentplugins)"
trap 'rm -rf "$TMP_DIR"' EXIT

info "Downloading from: $DOWNLOAD_URL"

if [[ "$DRY_RUN" == true ]]; then
  info "[dry-run] Would download $DOWNLOAD_URL to $TMP_DIR"
  info "[dry-run] Would extract $BINARY_NAME to $BIN_DIR/$INSTALL_NAME"
  exit 0
fi

HTTP_CODE="$(curl -fsSL -w '%{http_code}' -o "$TMP_DIR/agentplugins.tar.gz" "$DOWNLOAD_URL" || true)"

if [[ "$HTTP_CODE" != "200" ]]; then
  err "Download failed (HTTP $HTTP_CODE) for: $DOWNLOAD_URL"
  err "The platform $PLATFORM may not have a pre-built binary."
  err "Available platforms: darwin-arm64, darwin-x64, linux-arm64, linux-x64"
  exit 1
fi

log "Downloaded tarball"

# ─── Verify checksum ─────────────────────────────────────────────────────────

if curl -fsSL -o "$TMP_DIR/checksums.txt" "$CHECKSUM_URL" 2>/dev/null; then
  EXPECTED_HASH="$(grep "$BINARY_NAME" "$TMP_DIR/checksums.txt" | awk '{print $1}' || true)"
  if [[ -n "$EXPECTED_HASH" ]]; then
    info "Verifying SHA256 checksum…"
    ACTUAL_HASH=""
    if command -v shasum &>/dev/null; then
      ACTUAL_HASH="$(shasum -a 256 "$TMP_DIR/agentplugins.tar.gz" | awk '{print $1}')"
    elif command -v sha256sum &>/dev/null; then
      ACTUAL_HASH="$(sha256sum "$TMP_DIR/agentplugins.tar.gz" | awk '{print $1}')"
    fi

    # NOTE: checksum file hashes the raw binary, not the tarball.
    # Extract first, then verify.
    tar -xzf "$TMP_DIR/agentplugins.tar.gz" -C "$TMP_DIR"

    if command -v shasum &>/dev/null; then
      ACTUAL_HASH="$(shasum -a 256 "$TMP_DIR/$BINARY_NAME" | awk '{print $1}')"
    elif command -v sha256sum &>/dev/null; then
      ACTUAL_HASH="$(sha256sum "$TMP_DIR/$BINARY_NAME" | awk '{print $1}')"
    fi

    if [[ "$ACTUAL_HASH" == "$EXPECTED_HASH" ]]; then
      log "Checksum verified"
    else
      err "Checksum mismatch!"
      err "Expected: $EXPECTED_HASH"
      err "Actual:   $ACTUAL_HASH"
      exit 1
    fi
  else
    info "No checksum entry for $BINARY_NAME — skipping verification"
    tar -xzf "$TMP_DIR/agentplugins.tar.gz" -C "$TMP_DIR"
  fi
else
  info "No checksum file found — skipping verification"
  tar -xzf "$TMP_DIR/agentplugins.tar.gz" -C "$TMP_DIR"
fi

# ─── Install ─────────────────────────────────────────────────────────────────

if [[ ! -f "$TMP_DIR/$BINARY_NAME" ]]; then
  err "Binary not found in archive: $BINARY_NAME"
  ls -la "$TMP_DIR" >&2
  exit 1
fi

chmod +x "$TMP_DIR/$BINARY_NAME"

mkdir -p "$BIN_DIR"
mv "$TMP_DIR/$BINARY_NAME" "$BIN_DIR/$INSTALL_NAME"

log "Installed to: $BIN_DIR/$INSTALL_NAME"

# ─── Verify ──────────────────────────────────────────────────────────────────

if "$BIN_DIR/$INSTALL_NAME" --version &>/dev/null; then
  log "AgentPlugins $("$BIN_DIR/$INSTALL_NAME" --version)"
  echo "" >&2
  log "Done! Run 'agentplugins doctor' to verify your setup."
else
  err "Installation completed but binary failed to run."
  err "Try: chmod +x $BIN_DIR/$INSTALL_NAME"
  exit 1
fi
