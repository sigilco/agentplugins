#!/usr/bin/env bash
#
# build-binaries.sh — Compile AgentPlugins CLI into standalone native binaries
#                     using Bun's --compile flag.
#
# Produces 8 target binaries + checksums.
#
# Usage:
#   ./scripts/build-binaries.sh          # Build all targets
#   BUN=<path-to-bun> ./scripts/build-binaries.sh
#
# Requirements:
#   - Bun >= 1.2 installed
#   - pnpm dependencies installed (pnpm install)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$ROOT_DIR/packages/cli/src/cli.ts"
OUT_DIR="$ROOT_DIR/dist-binaries"
STAGING="$ROOT_DIR/packages/cli/dist"

# ─── Targets ─────────────────────────────────────────────────────────────────
# target-triple|bun-target|output-name
TARGETS=(
  "aarch64-apple-darwin|bun-darwin-arm64|agentplugins-darwin-arm64"
  "x86_64-apple-darwin|bun-darwin-x64|agentplugins-darwin-x64"
  "aarch64-unknown-linux-gnu|bun-linux-arm64|agentplugins-linux-arm64"
  "x86_64-unknown-linux-gnu|bun-linux-x64|agentplugins-linux-x64"
  "aarch64-unknown-linux-musl|bun-linux-arm64-musl|agentplugins-linux-arm64-musl"
  "x86_64-unknown-linux-musl|bun-linux-x64-musl|agentplugins-linux-x64-musl"
  "x86_64-pc-windows-msvc|bun-windows-x64|agentplugins-windows-x64.exe"
  "aarch64-unknown-linux-gnu|bun-linux-arm64|agentplugins-linux-arm64-baseline"
)

# ─── Helpers ─────────────────────────────────────────────────────────────────

log()   { printf '\033[1;32m✓\033[0m %s\n' "$*" >&2; }
info()  { printf '\033[1;34mℹ\033[0m %s\n' "$*" >&2; }
err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

check_bun() {
  local bun_bin="${BUN:-$(command -v bun || true)}"
  if [[ -z "$bun_bin" ]]; then
    err "Bun is not installed. Install from https://bun.sh"
    exit 1
  fi
  printf '%s' "$bun_bin"
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local bun_bin
  bun_bin="$(check_bun)"
  log "Using Bun: $bun_bin"
  "$bun_bin" --version

  # Build CLI TypeScript → JavaScript first (so entry resolves deps)
  info "Building CLI package (tsc)…"
  cd "$ROOT_DIR"
  pnpm --filter @agentplugins/cli build
  log "CLI built to $STAGING"

  # Prepare output directory
  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"

  # Compile each target
  local target_entry="$STAGING/cli.js"
  if [[ ! -f "$target_entry" ]]; then
    err "Entry not found: $target_entry — did tsc build succeed?"
    exit 1
  fi

  local triple bun_target out_name
  for target_line in "${TARGETS[@]}"; do
    IFS='|' read -r triple bun_target out_name <<< "$target_line"
    info "Compiling $triple ($bun_target) → $out_name"

    "$bun_bin" build "$target_entry" \
      --compile \
      --target="$bun_target" \
      --outfile="$OUT_DIR/$out_name" \
      || { err "Failed to compile $triple"; continue; }

    log "Built $out_name"
  done

  # Generate checksums
  info "Generating SHA256 checksums…"
  cd "$OUT_DIR"
  if command -v shasum &>/dev/null; then
    shasum -a 256 * > checksums-sha256.txt
  else
    sha256sum * > checksums-sha256.txt
  fi
  log "Checksums written to $OUT_DIR/checksums-sha256.txt"

  # Create tarballs for non-Windows binaries
  info "Creating tar.gz archives…"
  for f in "$OUT_DIR"/agentplugins-*; do
    [[ -f "$f" ]] || continue
    local base
    base="$(basename "$f")"
    if [[ "$base" == *.exe ]]; then
      zip -j "$OUT_DIR/$base.zip" "$f" 2>/dev/null || true
    else
      tar -czf "$OUT_DIR/$base.tar.gz" -C "$OUT_DIR" "$base"
    fi
  done
  log "Archives created"

  # Summary
  echo "" >&2
  log "All binaries in: $OUT_DIR"
  ls -lh "$OUT_DIR" >&2
}

main "$@"
