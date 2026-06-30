# Demo GIF creation

Source-of-truth process for the `docs/public/demo.gif` shown in the README and used in Show HN / social-media posts.

## Why manual, not CI

We considered a GitHub Action that re-renders `demo.gif` whenever `packages/cli/src/**` changes. Rejected for HN launch: it adds a moving part to the repo before the launch story is settled, and stale screenshots rarely block users more than a 5-minute manual re-render. Reconsider in v0.6.x if the GIF goes stale visibly more than twice.

## Tool

[VHS](https://github.com/charmbracelet/vhs) — declarative `.tape` files, real pixel output, regenerable by anyone with VHS installed.

```bash
mise install vhs
```

## Files

```
docs/public/demo.tape    # source of truth (declarative script)
docs/public/demo.gif     # rendered artifact (committed, referenced in README)
docs/public/demo.mp4     # rendered artifact (committed, for social posts)
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
| 1 | 0–3s | User starts a Claude session (`$ claude`) |
| 2 | 3–8s | User asks the agent to build a plugin |
| 3 | 8–18s | Agent scaffolds + compiles + pushes to GitHub (response is a fixture, not a live capture) |
| 4 | 18–28s | User exits, runs `agentplugins add sigilco/agentplugins-conventional-commits` |
| 5 | 28–33s | Final frame: `✓ Installed in: Claude Code, Codex, OpenCode, Pi` (the punchline) |

Total budget: 30–45s, width 1200, height 700, font size 16.

## Agent response (Frame 3) — why a fixture

A live capture of the agent scaffolding the plugin is more authentic, but brittle: any agent behavior change breaks the tape, and re-recording takes ~10 minutes. A scripted fixture (text captured once, committed as `docs/public/demo-frames/agent-response.txt`, typed by VHS) is reproducible in 30 seconds and is honest enough for a launch demo. If you want a live capture, replace the `Type` step with `Require`-style waits + a live terminal — accept the maintenance cost.

## Plumbing

- VHS pulls `ttyd` and `ffmpeg` automatically on macOS.
- The `.tape` uses `Output docs/public/demo.gif` and `Output docs/public/demo.mp4` so a single run produces both.
- Screenshots reference `./docs/public/img/logo-light.png` and `./docs/public/img/logo-dark.png` if any frame embeds the logo.

## What is NOT in scope

- Auto-rendering on PR / CLI change (deferred to v0.6.x).
- GIF hosting on a CDN (the file is small and GitHub renders it natively).
- git-lfs (the GIF stays under 5 MB; if it ever blows past, switch then).