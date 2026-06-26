# Architecture

AgentPlugins is a **ports-and-adapters (hexagonal) compiler pipeline**.

Two orthogonal axes:
- **Capability axis** (hooks/commands/continueWith/…) — *layered*: modeled once in `contract`, emitted via the shared `compile` kernel. Cross-cutting capabilities hit every target, so the kernel handles them once.
- **Target axis** (claude/codex/opencode/pimono/…) — *sliced*: each `adapter-*` is a self-contained vertical slice over the kernel, declaring only its event-name table and target config.

This is deliberately *not* vertical-slice architecture for capabilities: slicing a compiler vertically per capability duplicates the pipeline. The pain of multiple drifting contracts is cured by a shared kernel and a single contract, not by slicing.

---

## Package dependency graph

Dependencies flow inward — inner rings are more stable.

```mermaid
graph TD
    CLI["@agentplugins/cli"]
    CORE["@agentplugins/core (facade)"]
    CONTRACT["@agentplugins/contract"]
    COMPILE["@agentplugins/compile"]
    STORE["@agentplugins/store"]
    SCHEMA["@agentplugins/schema"]
    SECURITY["@agentplugins/security"]
    A_CLAUDE["adapter-claude"]
    A_CODEX["adapter-codex"]
    A_COPILOT["adapter-copilot"]
    A_GEMINI["adapter-gemini"]
    A_KIMI["adapter-kimi"]
    A_OC["adapter-opencode"]
    A_PI["adapter-pimono"]

    CLI --> CORE
    CLI --> A_CLAUDE & A_CODEX & A_COPILOT & A_GEMINI & A_KIMI & A_OC & A_PI
    CORE --> CONTRACT & COMPILE & STORE
    A_CLAUDE & A_CODEX & A_COPILOT & A_GEMINI & A_KIMI & A_OC & A_PI --> COMPILE
    COMPILE --> CONTRACT
    STORE --> CONTRACT & SECURITY
    SCHEMA --> CONTRACT

    style CONTRACT fill:#ffd700,color:#000
    style COMPILE fill:#87ceeb,color:#000
    style CORE fill:#90ee90,color:#000
```

**Allowed dependency directions (inward only):**

| Package | Single responsibility | Allowed deps |
|---|---|---|
| `contract` | Zod schema → TS types → JSON Schema. The single source of truth for the manifest model. | `zod` |
| `compile` | Shared codegen kernel: emit helpers, sanitizers, lint, validation, hook-wrapper. | `contract` |
| `store` | Fetch / install / link / fs isolation. Registry, symlink fanout, doctor. | `contract`, `security` |
| `schema` | Re-exports generated JSON Schema artifacts from `contract` build step. | `contract` |
| `security` | Safe-fetch, integrity verification, script-policy. No plugin dependencies. | — |
| `adapter-*` | Target config + event-name table + calls to kernel helpers. | `compile` (→ `contract`) |
| `core` | Re-export facade. Public API is unchanged; internal origin moves to sub-packages. | `contract`, `compile`, `store` |
| `cli` | Build/add/install/link commands, tty output. | `core`, `adapter-*` |

---

## Compile pipeline

Plugin source → universal IR → per-target files.

```mermaid
flowchart LR
    SRC["plugin.ts\n(definePlugin)"]
    VALIDATE["validateUniversal()\n+ validateForPlatform()"]
    IR["PluginManifest IR"]
    LINT["lint()\n(handler-safety, secrets, …)"]
    EMIT["adapter.compile()\n→ emitCommandHandler()\n→ emitInlineHandler()\n→ sanitizeName/Join()"]
    FILES["dist/<target>/\n*.ts / *.json / *.md"]
    NATIVE["nativeCopies\n(verbatim passthrough)"]

    SRC --> VALIDATE --> IR --> LINT --> EMIT --> FILES
    IR -.->|nativeEntry set| NATIVE --> FILES
```

**Key emit invariants (enforced in `compile` kernel, not per-adapter):**

- `emitCommandHandler(cmd)` — emits as a quoted string array; never uses template-literal interpolation; never passes `shell: true`.
- `emitInlineHandler(fn)` — serializes via `.toString()` once, in the kernel. Adapters call this helper rather than serializing directly.
- `sanitizeName(name)` — rejects `..`, absolute paths, non-kebab characters. Used for plugin names and SKILL.md frontmatter names.
- `sanitizeJoin(base, untrusted)` — resolves `path.join(base, untrusted)` then asserts the result starts with `base`. Used for `nativeCopies.from/to`.

---

## Distribute pipeline

Source → fetch → install → link → harness discovers plugin.

```mermaid
flowchart LR
    SRC["GitHub URL\n(or local path)"]
    CLONE["cloneRepo()\nor pullRepo()"]
    STORE_DIR["~/.agents/plugins/<name>/"]
    BUILD["agentplugins build\n→ dist/<target>/"]
    LINK["symlinkPlugin()\nlinkCompiledPlugin()\nlinkPluginSkills()"]
    HARNESS["Harness plugin dirs\n~/.config/opencode/plugins/\n~/.pi/agent/extensions/\n~/.claude/plugins/\n…"]

    SRC --> CLONE --> STORE_DIR --> BUILD --> LINK --> HARNESS
```

**Store invariants:**

- Plugin store root: `~/.agents/plugins/<sanitized-name>/`
- Pre-install wipes all previous links (compiled + skills + native + symlink) via `unlinkAll()`.
- Symlink operations use `lstatSync` before `unlinkSync`; never call `rmSync(recursive)` on real directories.
- Install on a repo declaring a denylist lifecycle script → blocked before `cloneRepo`.

---

## Adapter port contract

Every `adapter-*` implements `PlatformAdapter` (defined in `contract`):

```typescript
interface PlatformAdapter {
  readonly name: TargetPlatform;
  readonly displayName: string;
  readonly supportedHooks: readonly UniversalHookName[];
  readonly supportedHandlers: readonly HandlerType[];
  readonly manifestPath: string;
  readonly manifestFormat: 'json' | 'toml';

  validate(plugin: PluginManifest): ValidationIssue[];
  compile(plugin: PluginManifest): AdapterOutput;
}
```

Adapters declare **only**:
1. `HOOK_MAPPING: Partial<Record<UniversalHookName, string>>` — universal → target event name
2. `validate()` — target-specific constraint checks (delegates to `compile` kernel)
3. `compile()` — calls kernel helpers to emit files; must not contain raw `shell: true` or string interpolation into commands

The kernel (`compile`) owns all security-sensitive emit logic. Adapters are thin mappings.
