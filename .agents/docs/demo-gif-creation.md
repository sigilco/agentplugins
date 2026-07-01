# Demo GIF creation

Source-of-truth process for the `docs/public/demo.gif` shown in the README and used in Show HN / social-media posts.

## Why manual, not CI

We considered a GitHub Action that re-renders `demo.gif` whenever `packages/cli/src/**` changes. Rejected for HN launch: it adds a moving part to the repo before the launch story is settled, and stale screenshots rarely block users more than a 5-minute manual re-render. Reconsider in v0.6.x if the GIF goes stale visibly more than twice.

## Tool

[VHS](https://github.com/charmbracelet/vhs) — declarative `.tape` files, real pixel output, regenerable by anyone with VHS installed. [gum](https://github.com/charmbracelet/gum) drives the fake-agent HUD (Frame 3).

```bash
mise install     # picks up vhs + aqua:charmbracelet/gum from mise.toml
```

## Files

```
docs/public/demo.tape           # source of truth (declarative script)
docs/public/demo-agent-hud.sh   # scripted fake-agent HUD (gum banner/spinner/tool-call lines)
docs/public/demo.gif            # rendered artifact (committed, referenced in README)
docs/public/demo.mp4            # rendered artifact (committed, for social posts)
```

## Render locally

```bash
cd docs/public
vhs demo.tape            # produces demo.gif + demo.mp4
```

Re-render whenever any of these change:

- The CLI's `add` command output (installer text)
- The Tier-1 harness list (Claude Code, Codex, OpenCode, Pi)
- The plugin name featured in the storyboard (`agentplugins-conventional-commits`)

## Storyboard (current)

| Frame | Duration | What happens |
| --- | --- | --- |
| 1 | 0–1s | `cd` into a pre-warmed demo folder |
| 2 | 1–2s | User's natural-language ask typed live (shell comment, cosmetic only) |
| 3 | 2–6s | Scripted fake-agent HUD runs (`docs/public/demo-agent-hud.sh`), prints `Plugin is ready` |
| 4 | 6–7s | `clear` |
| 5 | 7–12s | Real `agentplugins add sigilco/agentplugins-conventional-commits -y`, waits for `Installed to:` (the punchline) |

Total budget: 15–30s, width 1200, height 700, font size 18.

## Agent HUD (Frame 3) — why scripted

A live capture of the agent scaffolding the plugin is more authentic, but brittle and slow: any agent behavior change breaks the tape, and a real `claude` run takes 5–15 minutes to render. Instead `docs/public/demo-agent-hud.sh` drives [`gum`](https://github.com/charmbracelet/gum) (mise tool `aqua:charmbracelet/gum`) to render a real bordered banner, a real animated spinner, and boxed tool-call lines — deterministic, no network/API calls, runs in ~3s. The install segment stays a real, live `agentplugins add` call; it's already fast and deterministic, and is the visual punchline.

## Plumbing

- VHS pulls `ttyd` and `ffmpeg` automatically on macOS.
- The `.tape` uses `Output docs/public/demo.gif` and `Output docs/public/demo.mp4` so a single run produces both.
- Screenshots reference `./docs/public/img/logo-light.png` and `./docs/public/img/logo-dark.png` if any frame embeds the logo.

## What is NOT in scope

- Auto-rendering on PR / CLI change (deferred to v0.6.x).
- GIF hosting on a CDN (the file is small and GitHub renders it natively).
- git-lfs (the GIF stays under 5 MB; if it ever blows past, switch then).