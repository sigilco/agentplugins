---
description: Validate your plugin manifest before publishing
---

# Linting

`agentplugins lint` checks your manifest against eight rules that catch the most common publishing mistakes. Run it before every release.

```bash
agentplugins lint
```

```text
Linting my-plugin@1.0.0

  naming          ✓ name is kebab-case
  versioning      ✓ version is valid semver
  description     ✓ description is descriptive (42 chars)
  license         ✓ license declared: Apache-2.0
  target-hygiene  ✓ 7 targets, all recognized
  hook-coverage   ⚠ 2 hooks unsupported on kimi (sessionEnd, userPromptSubmit)
  handler-safety  ✓ all command handlers use ./-prefixed paths
  secrets         ✓ no plaintext secrets detected

7 passed, 1 warning.
```

## Rules

### `naming`

Checks that `name` is kebab-case (`^[a-z][a-z0-9-]*$`), max 64 chars, and not prefixed with `agentplugin`.

```text
✗ naming: name "AgentPlugin" must be kebab-case
✗ naming: name "agentplugin-foo" must not be prefixed with "agentplugin"
```

### `versioning`

Checks that `version` is valid [semver](https://semver.org/).

```text
✗ versioning: version "1.0" is not valid semver (need MAJOR.MINOR.PATCH)
```

### `description`

Checks that `description` is at least 10 characters and not a placeholder.

```text
✗ description: description "todo" is too short (min 10 chars)
✗ description: description matches placeholder pattern ("my plugin")
```

### `license`

Checks that `license` is declared and matches a known [SPDX identifier](https://spdx.org/licenses/).

```text
✗ license: license field is missing
✗ license: "MIT2" is not a recognized SPDX identifier
```

### `target-hygiene`

Checks that every entry in `targets` is a recognized platform and warns on duplicates or empty arrays.

```text
✗ target-hygiene: unknown target "claude2"
⚠ target-hygiene: target list contains duplicates
```

### `hook-coverage`

Warns when a hook you've declared isn't supported by one of your targets. The hook will be silently ignored on that platform.

```text
⚠ hook-coverage: hooks.sessionEnd is not supported by codex — will be ignored
⚠ hook-coverage: hooks.userPromptSubmit is not supported by kimi — will be ignored
```

See the [adapters reference](/reference/adapters) for the per-platform coverage matrix.

### `handler-safety`

Checks that every `command` handler uses `./`-prefixed paths or placeholders, and rejects path traversal (`..`).

```text
✗ handler-safety: handler command uses absolute path "/usr/local/bin/foo"
✗ handler-safety: handler command contains ".." traversal
```

### `secrets`

Scans the manifest for common secret patterns (API keys, tokens, private keys) and flags them. Use `${PLUGIN_DATA}` placeholders instead.

```text
✗ secrets: possible AWS access key in mcpServers.github.env.GITHUB_TOKEN
✗ secrets: possible private key in hooks.preToolUse.handler.command
```

## JSON output

Pass `--json` to get machine-readable output for CI:

```bash
agentplugins lint --json
```

```json
{
  "plugin": "my-plugin",
  "version": "1.0.0",
  "rules": {
    "naming":          { "status": "pass" },
    "versioning":      { "status": "pass" },
    "description":     { "status": "pass" },
    "license":         { "status": "pass" },
    "target-hygiene":  { "status": "pass" },
    "hook-coverage":   {
      "status": "warn",
      "warnings": [
        "hooks.sessionEnd is not supported by codex — will be ignored",
        "hooks.userPromptSubmit is not supported by kimi — will be ignored"
      ]
    },
    "handler-safety":  { "status": "pass" },
    "secrets":         { "status": "pass" }
  },
  "summary": { "passed": 7, "warnings": 1, "failed": 0 }
}
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All rules passed (warnings allowed). |
| `1` | At least one rule failed. |
| `2` | Manifest could not be loaded or parsed. |

## CI integration

A typical CI step:

```yaml
- name: Lint plugin
  run: agentplugins lint
```

Fail the build on any error. Treat `hook-coverage` warnings as informational unless the hook is critical to your plugin's behavior — in which case, narrow `targets` to the platforms that support it.

## Next steps

- [Creating plugins](/guide/creating-plugins) — the full authoring workflow.
- [CLI reference](/reference/commands) — every command and flag.
- [Adapters reference](/reference/adapters) — why some hooks are unsupported per target.
