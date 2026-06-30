# AgentPlugins demo GIF — VHS source of truth
#
# Render: cd docs/public && vhs demo.tape
# Produces: demo.gif + demo.mp4

Output docs/public/demo.gif
Output docs/public/demo.mp4

Set Shell bash
Set FontSize 16
Set Width 1200, Height 700
Set Padding 20
Set Theme "Tokyo Night"
Set TypingSpeed 50ms
Set PlaybackSpeed 1.0

# ─────────────────────────────────────────────────────────────────────────────
# Frame 1 — User starts a Claude session
# ─────────────────────────────────────────────────────────────────────────────
Type "claude"
Enter
Sleep 2s

# ─────────────────────────────────────────────────────────────────────────────
# Frame 2 — User asks the agent to build a plugin
# ─────────────────────────────────────────────────────────────────────────────
Type "Build a plugin using @agentplugins/cli that auto-generates conventional commit messages from the staged diff. Make it work on Claude Code, Codex, OpenCode, and Pi."
Enter

# Agent "thinking" — clear, no spinner
Sleep 1s
Type "..."
Sleep 4s

# ─────────────────────────────────────────────────────────────────────────────
# Frame 3 — Agent reports done (scripted response, see demo-frames/agent-response.txt)
# ─────────────────────────────────────────────────────────────────────────────
Sleep 500ms

Type "I'll scaffold the plugin from the official template."
Sleep 800ms
Enter
Sleep 600ms

Type "$ agentplugins init conventional-commits"
Enter
Sleep 800ms
Type "✓ Created agentplugins-conventional-commits"
Sleep 800ms
Enter
Sleep 400ms

Type "$ agentplugins build"
Enter
Sleep 800ms
Type "✓ Compiled for Claude Code, Codex, OpenCode, Pi"
Sleep 800ms
Enter
Sleep 400ms

Type "Pushed to https://github.com/sigilco/agentplugins-conventional-commits"
Sleep 2s

# ─────────────────────────────────────────────────────────────────────────────
# Frame 4 — User exits and installs directly
# ─────────────────────────────────────────────────────────────────────────────
Type "exit"
Enter
Sleep 1s

Type "agentplugins add sigilco/agentplugins-conventional-commits"
Enter

# Real CLI output (or near-real — captured once and pasted)
Sleep 1s
Type "Resolving sigilco/agentplugins-conventional-commits@latest"
Sleep 600ms
Enter
Sleep 400ms

Type "Detected 4 agents: Claude Code, Codex, OpenCode, Pi"
Sleep 800ms
Enter
Sleep 600ms

Type "Compiling for opencode, pimono..."
Sleep 1s
Enter
Sleep 800ms

# ─────────────────────────────────────────────────────────────────────────────
# Frame 5 — Punchline: installed everywhere
# ─────────────────────────────────────────────────────────────────────────────
Type "✓ Installed conventional-commits v0.1.0"
Sleep 2s
Enter
Sleep 600ms

Type "Installed to:"
Sleep 400ms
Enter
Sleep 400ms
Type "  Claude Code: ~/.claude/plugins/conventional-commits"
Sleep 400ms
Enter
Sleep 400ms
Type "  Codex:       ~/.codex/extensions/conventional-commits"
Sleep 400ms
Enter
Sleep 400ms
Type "  OpenCode:    ~/.config/opencode/plugins/conventional-commits"
Sleep 400ms
Enter
Sleep 400ms
Type "  Pi:          ~/.pi/extensions/conventional-commits"
Sleep 3s