# AnyHarness manifest (L0)

**Spec version: 0.1.0-draft**

This document defines the AnyHarness package manifest: an Agent Plugins 1.0
`plugin.json` used verbatim as the base format, plus the `dev.anyharness`
vendor namespace that carries the behavioral component types Agent Plugins
deliberately leaves to clients (hooks, commands, agents, rules, setup).

The machine-readable companion is `manifest.schema.json`.

## 1. Conformance language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and
OPTIONAL are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## 2. Base format: Agent Plugins 1.0 `plugin.json`

An AnyHarness package manifest **is** an Agent Plugins 1.0 manifest as defined
by the Agent Plugins specification (<https://agent-plugins.org>, normative
text: `spec/1.0.0.md` in
<https://github.com/agentplugins/agent-plugins-spec>). This document does not
redefine any base field; the following are adopted by reference:

| Field | Source | AnyHarness use |
| ----- | ------ | -------------- |
| `$schema` | Agent Plugins §5.2 | Required; canonical id selects the base spec version. |
| `name` | Agent Plugins §5.3, §5.5 | Required; becomes the `packages/<name>/` directory name. |
| `version` | Agent Plugins §5.4 | Optional there; AnyHarness installers SHOULD require it (needed for `ManifestRef` and update checks). SemVer RECOMMENDED. |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | Agent Plugins §5.4 | Metadata, unchanged semantics. |
| `extensions` | Agent Plugins §5.6, §8 | Namespace map; `dev.anyharness` is our key (§4). |

Adopted behavioral rules:

- The manifest schema is **closed** (Agent Plugins §5.2): unknown top-level
  fields are reported-and-ignored, never given semantics.
- Component discovery is by **fixed location** (Agent Plugins §6): `skills/`
  and `mcp.json` at the package root. `plugin.json` cannot relocate or
  inline them.
- **Containment** (Agent Plugins §4.1): every package path resolves within
  the package root; `./`-prefixed relative paths only.
- **Data, not code**: a manifest is JSON and MUST NOT be runtime-evaluated.
  TypeScript authoring configs compile to `plugin.json` at build time; the
  runtime path contains no JS evaluation. This removes the embedded-engine
  requirement entirely.

AnyHarness conformance additionally requires that the package be loadable by
an Agent Plugins 1.0 conformant client that implements no `dev.anyharness`
namespace: such a client sees a valid skills+MCP plugin and ignores our
namespace, per Agent Plugins §8.1.

## 3. The `dev.anyharness` namespace

Agent Plugins §8 defines the extension mechanism: client-specific manifest
data under `extensions["<reverse-domain>"]`, and client-specific files under
a top-level directory named for the namespace. The spec's own ecosystem
precedent is `com.github.copilot` (GitHub Copilot's vendor namespace).

AnyHarness's namespace is **`dev.anyharness`**, used in both forms:

```text
my-plugin/
├── plugin.json                 # Agent Plugins 1.0 manifest
│                               #   extensions["dev.anyharness"] = manifest data
├── skills/                     # Agent Plugins standard component dir
├── mcp.json                    # Agent Plugins standard component file
└── dev.anyharness/             # extension directory — behavioral components
    ├── hooks.json              # hook declarations
    ├── commands/               # slash-command definitions (*.md)
    ├── agents/                 # agent definitions (*.md)
    ├── rules/                  # rule files (*.md)
    └── setup                   # optional setup script (exec policy: trust.md)
```

Rules:

1. Every file under `dev.anyharness/` is package data subject to Agent
   Plugins §4.1 containment. Component definitions are **files**, never
   function serialization.
2. A component type whose fixed location is absent is not an error (Agent
   Plugins §6.2 semantics apply).
3. `dev.anyharness/` MUST NOT contain executable component formats other than
   the fixed locations in §5 — new kinds are added by spec revision, not ad
   hoc.
4. The manifest-data form (`extensions["dev.anyharness"]`) and the directory
   form are independent; both MAY be present. Manifest data carries
   declarations and policy requests; the directory carries component content.

## 4. `extensions["dev.anyharness"]` — manifest data

The namespace object is validated by
`manifest.schema.json#/$defs/AnyharnessNamespace`. Fields:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `namespaceVersion` | integer | yes | Version of the `dev.anyharness` data format. This document defines `1`. |
| `capabilities` | string[] | no | **Capabilities** slots the package requests (§6). |
| `engines` | object | no | Compatibility ranges; the only defined member is `harness`, a SemVer range against the AnyHarness implementation version (§8). |
| `hooksFormat` | integer | no | Version of `hooks.json` used; defaults to `1`. |
| `componentsFormat` | integer | no | Frontmatter format version for `commands/`, `agents/`, `rules/` files; defaults to `1`. |

Unknown fields inside `extensions["dev.anyharness"]` MUST be reported and
ignored (mirroring Agent Plugins §5.2's non-fatal rule for unknown top-level
fields). A missing or non-integer `namespaceVersion` makes the namespace
object invalid: the implementation MUST skip `dev.anyharness` processing for
that package while still loading Agent Plugins components. A
`namespaceVersion` greater than the implementation's supported version MUST
be treated as unsupported the same way.

## 5. Component locations and kinds

Components discovered under `dev.anyharness/` map onto **ExtensionKind**
values (`spec/store-layout.md` §2):

| Fixed location | ExtensionKind | Format |
| -------------- | ------------- | ------ |
| `skills/<dir>/SKILL.md` (package root) | `skill` | Agent Skills spec — not ours to redefine |
| `mcp.json` (package root) | `mcp` | Agent Plugins 1.0 §7.2 MCP configuration |
| package root (the manifest itself) | `plugin` | This document + Agent Plugins 1.0 |
| `dev.anyharness/hooks.json` | `hook` | §5.1 |
| `dev.anyharness/commands/<name>.md` | `command` | §5.2 |
| `dev.anyharness/agents/<name>.md` | `agent` | §5.3 |
| `dev.anyharness/rules/<name>.md` | `rule` | §5.4 |
| `dev.anyharness/setup` | (script policy, not a component) | §5.5 |

Discovery of each type follows Agent Plugins §6.1–6.2: fixed locations only,
absence is not an error, wrong filesystem kind invalidates that component
type only.

### 5.1 `hooks.json` — hook declarations

A single JSON object at `dev.anyharness/hooks.json` declaring host lifecycle
hooks. `hooksFormat` version 1:

```json
{
  "hooks": {
    "<event>": [
      { "command": "./dev.anyharness/hooks/on-load.sh", "timeout": 30 }
    ]
  }
}
```

- `hooks` maps an event name to an ordered array of hook entries. The set of
  event names is defined by the bridge/host contract (see `spec/bridge/`),
  not by this document; implementations MUST ignore unknown event names.
- A hook entry's `command` follows Agent Plugins §7.2.1 `command` semantics:
  one executable token — a bare executable name or a `./`-prefixed
  package-relative path — never a shell string. `args` (string[]) MAY be
  present and support `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expansion per Agent
  Plugins §9.2.
- `timeout` is seconds (integer, optional).
- Hook execution is governed by the script policy in `trust.md`; declaring a
  hook is not authorization to run it.

### 5.2 `commands/<name>.md` — slash commands

Markdown files with YAML frontmatter — the converged convention (same
shape as `SKILL.md` frontmatter and `.claude`/`codex` command files).
Frontmatter fields, `componentsFormat` version 1:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `name` | string | yes | Command name as invoked; defaults to filename stem if equal after normalization. |
| `description` | string | no | One-line summary for command listings. |

The body is the command's prompt/template content, passed to the host
verbatim. Files not matching `*.md` are ignored.

### 5.3 `agents/<name>.md` — agent definitions

Same envelope as commands: markdown body plus YAML frontmatter, format
version 1:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `name` | string | yes | Agent identifier. |
| `description` | string | no | When/why to invoke this agent. |
| `tools` | string[] | no | Capability or tool names the agent requests. |

The body is the agent's instruction text.

### 5.4 `rules/<name>.md` — rules

Plain markdown rule files. Frontmatter MAY carry `name` and `description`
(format version 1); bodies are appended or injected per host convention.
Rule files MUST NOT be treated as executable.

### 5.5 `setup` — install-time script

An optional executable file `dev.anyharness/setup` run at install time.
Whether it runs at all, and under what confirmation, is entirely a trust
decision (`trust.md` §Script policy). The manifest gives no way to bypass
that policy.

## 6. Capabilities requests

The `capabilities` array in `extensions["dev.anyharness"]` names the
**Capabilities** slots the package's components need at runtime —
host-injected environment slots such as `storage`, `secrets`, `exec`,
`network`, `fs`. The value is an array of slot-name strings
(`manifest.schema.json#/$defs/Capabilities`).

1. Requesting a capability is a declaration, not a grant. The host decides
   which slots exist (a browser host has no `exec`) and which are granted
   (`trust.md`).
2. A component MUST be written to tolerate absent slots — absence is declared
   at `capabilities.negotiate` time, never probed.
3. Unknown slot names are not an error; the host ignores slots it does not
   define.

## 7. `ManifestRef`

Wherever the store or lockfile references "the manifest that produced this,"
the reference is a **ManifestRef**: `{ name, version }` — the manifest's own
two fields as resolved at install time. `version` SHOULD be required by
installers because a manifest without it produces an incomplete ManifestRef.

## 8. Versioning policy

Harness APIs churn faster than package formats; the spec therefore versions
at four independent layers:

1. **Base manifest version** — inherited from Agent Plugins: the `plugin.json`
   `$schema` canonical identifier selects the base spec version (e.g.
   `…/schemas/1.0.0/plugin.schema.json`). AnyHarness tracks published Agent
   Plugins versions; a package declaring an unrecognized base version is
   rejected per Agent Plugins §5.2.
2. **Namespace version** — `namespaceVersion` inside
   `extensions["dev.anyharness"]` versions our manifest-data format. Bumped
   on incompatible change; implementations reject higher versions (§4).
3. **Component-kind formats** — `hooksFormat` and `componentsFormat` version
   `hooks.json` and the markdown frontmatter contract independently, so a
   format change in one kind does not invalidate the rest.
4. **Package↔harness compat range** — `engines.harness` is a SemVer range
   (SemVer 2.0.0, <https://semver.org>; range syntax per npm semver)
   evaluated against the installing AnyHarness implementation version. A
   package whose range excludes the implementation MUST NOT be installed;
   the installer reports the required range. Absence means unbounded.

Evolution rules for this document: adding an optional field or component
location is a spec minor change; removing or reinterpreting a field,
narrowing a value set, or changing a fixed location is a major change.

## 9. Examples

Minimal AnyHarness package (identical to a valid Agent Plugins package —
conformant by construction):

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "hello-plugin",
  "version": "1.0.0"
}
```

With `dev.anyharness` data:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "deploy-tools",
  "version": "2.1.0",
  "extensions": {
    "dev.anyharness": {
      "namespaceVersion": 1,
      "capabilities": ["exec", "storage"],
      "engines": { "harness": ">=0.1.0 <1.0.0" },
      "hooksFormat": 1,
      "componentsFormat": 1
    }
  }
}
```

## 10. Normative references

- Agent Plugins Specification 1.0 — base manifest, extensions mechanism
  (§8), containment (§4.1), MCP config (§7.2), placeholder expansion (§9),
  failure boundaries (§11.3). <https://agent-plugins.org> /
  <https://github.com/agentplugins/agent-plugins-spec>
- Agent Skills specification — `SKILL.md` component format.
  <https://agentskills.io/specification>
- Model Context Protocol — `mcp.json` wire targets.
  <https://modelcontextprotocol.io>
- SemVer 2.0.0 — `version` values and `engines.harness` ranges.
  <https://semver.org>
