# AgentPlugins demo GIF — VHS source of truth (scripted fake-agent HUD + real install)
#
# Render: vhs docs/public/demo.tape
# Produces: docs/public/demo.gif + docs/public/demo.mp4 (canonical, <5 MB)
#
# Higher-res render for social media: render with docs/public/demo-hq.tape at
# 1920x1080 — see .agents/docs/demo-gif-creation.md.
#
# This tape types a natural prompt live (real VHS typing animation), then runs
# a scripted fake-agent HUD (docs/public/demo-agent-hud.sh, gum-driven: real
# bordered banner + real animated spinner + boxed tool-call lines) that prints
# `Plugin is ready` deterministically in ~3s — no live `claude` call, no
# network, no flakiness. The install segment (`agentplugins add ...`) is real
# and is the visual punchline; it runs with HOME pointed at a throwaway /tmp
# dir so the printed install paths and on-disk writes don't leak the
# operator's real home directory/username into a publicly shared asset.
#
# Fallback: if demo.gif > 5 MB, use demo-print.tape (the claude -p flow).

Output docs/public/demo.gif
Output docs/public/demo.mp4

Set Shell bash
Set FontSize 18
Set Width 1200
Set Height 700
Set Padding 20
Set Theme Dracula
Set TypingSpeed 50ms
Set WaitTimeout 30s

# ─────────────────────────────────────────────────────────────────────────────
# Frame 1 — cd into a pre-warmed demo folder (git-init'd so the agent doesn't
# stall on a repo-create prompt). Capture the HUD script's absolute path
# before cd'ing away (hidden from the recording — pure setup, not part of the
# story) so the render works regardless of repo checkout location.
# ─────────────────────────────────────────────────────────────────────────────
Hide
Type "HUD=$PWD/docs/public/demo-agent-hud.sh"
Enter
Type "DEMO_HOME=/tmp/agentplugins-demo-home"
Enter
Type "mkdir -p $DEMO_HOME"
Enter
Type "clear"
Enter
Show

Type "cd /tmp/agentplugins-demo"
Enter
Sleep 500ms

# ─────────────────────────────────────────────────────────────────────────────
# Frame 2 — type the prompt live (typed at the shell, read by the fake-HUD
# script below — purely for the visual of a natural-language ask).
# ─────────────────────────────────────────────────────────────────────────────
Type "# Read the agentplugins docs, scaffold a conventional-commits plugin, build it, push it, print Plugin is ready when done"
Enter
Sleep 500ms

# ─────────────────────────────────────────────────────────────────────────────
# Frame 3 — run the scripted fake-agent HUD (gum banner + spinner + boxed
# tool-call lines), block on its marker (no Sleep-guessing).
# ─────────────────────────────────────────────────────────────────────────────
Type "bash $HUD"
Enter
Wait+Screen /Plugin is ready/
Sleep 1s

# ─────────────────────────────────────────────────────────────────────────────
# Frame 4 — clear before the install frame.
# ─────────────────────────────────────────────────────────────────────────────
Type "clear"
Enter
Sleep 500ms

# ─────────────────────────────────────────────────────────────────────────────
# Frame 5 — install the plugin into the system.
# ─────────────────────────────────────────────────────────────────────────────
Type "HOME=$DEMO_HOME agentplugins add sigilco/agentplugins-conventional-commits -y"
Enter
Wait+Screen /Installed to:/
Sleep 2s
