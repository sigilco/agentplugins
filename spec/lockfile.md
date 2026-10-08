# AnyHarness lockfile: `extensions.lock` (L0)

**Spec version: 0.1.0-draft**

This document defines `~/.agents/harness/extensions.lock`, the deterministic
record of installed Extensions. It exists so installs are reproducible,
`doctor` can verify integrity, and updates know exactly what they are
replacing. It is a state file, not user configuration — users edit
`config.toml`, never the lockfile.

The machine-readable companion is `lockfile.schema.json`.

## 1. Conformance language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and
OPTIONAL are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## 2. Location and write semantics

1. The lockfile lives at `~/.agents/harness/extensions.lock` — inside our
   sole owned root key (`store-layout.md` §4). Nothing else may write it.
2. It is UTF-8 JSON, one top-level object, pretty-printed with two-space
   indentation, extension keys sorted lexically. Deterministic output keeps
   diffs reviewable and merges mechanical.
3. Writes follow `store-layout.md` §7: staged in `harness/tmp/` then renamed
   atomically, while holding `harness/.lock`. Readers MUST tolerate reading
   either the previous or next complete file.
4. A lockfile that is missing, unparseable, or fails schema validation is
   treated as empty for reads and MUST NOT be overwritten silently — the
   implementation preserves the corrupt file (e.g. renamed aside) before
   writing a fresh one, and reports the event in `audit.log` (`trust.md`).

## 3. Format

```json
{
  "version": 1,
  "extensions": {
    "deploy-tools": {
      "kind": "plugin",
      "manifest": { "name": "deploy-tools", "version": "2.1.0" },
      "source": {
        "type": "github",
        "uri": "https://github.com/acme/deploy-tools",
        "ref": "v2.1.0"
      },
      "integrity": "sha256-9f2c…",
      "installedAt": "2026-10-08T07:00:00Z",
      "updatedAt": "2026-10-08T07:00:00Z",
      "targets": ["codex", "claude-code"],
      "components": [
        { "kind": "skill", "name": "deploy" },
        { "kind": "mcp", "name": "deploy-api" },
        { "kind": "hook", "name": "on-load" },
        { "kind": "command", "name": "release" },
        { "kind": "agent", "name": "reviewer" },
        { "kind": "rule", "name": "house-style" }
      ]
    }
  }
}
```

### 3.1 Top-level object

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `version` | integer | yes | Lockfile format version. This document defines `1`. Readers MUST refuse a higher version. |
| `extensions` | object | yes | Map from Extension name (the `packages/<name>/` or `skills/<name>/` directory name) to an **Extension** entry. MAY be empty. |

### 3.2 Extension entry

Each value of `extensions` is an **Extension** — the installed unit
(`store-layout.md` §2):

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `kind` | ExtensionKind | yes | The installed unit's kind — typically `plugin` (a manifest-bearing package) or `skill` (a standalone materialized skill). Closed enum: `skill \| mcp \| plugin \| hook \| command \| agent \| rule`. |
| `manifest` | ManifestRef | yes | `{ name, version }` resolved from the extension's `plugin.json` (or equivalent manifest) at install time. `manifest.name` MUST equal the `extensions` map key. |
| `source` | object | yes | Where the extension came from; see §3.3. |
| `integrity` | string | yes | Content digest of the installed package tree; see §4. |
| `installedAt` | string | yes | RFC 3339 / ISO 8601 UTC timestamp of first install. |
| `updatedAt` | string | yes | Timestamp of last update; equals `installedAt` until first update. |
| `targets` | string[] | yes | Harness identifiers the extension has been materialized/emitted to (e.g. `"codex"`, `"claude-code"`, `"opencode"`). MAY be empty. Updated by emit operations. |
| `components` | object[] | no | Inventory of contributed components: `{ kind, name }` pairs, `kind` drawn from ExtensionKind. Informational; absence means "not inventoried," not "no components." |
| `capabilities` | string[] | no | Capability slots granted at install time (subset of the manifest's request; `manifest.md` §6, `trust.md`). |
| `attestations` | object[] | no | Reserved for signing/provenance attestations (sigstore-style). Defined by `trust.md` §5; entries are opaque to the lockfile. |

### 3.3 Source object

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `type` | string | yes | One of `git`, `github`, `registry`, `local`. Closed enum; new source types are a spec minor change. |
| `uri` | string | yes | Source identifier in canonical form for its type: `git` → clone URL; `github` → `owner/repo` or repo URL (SHOULD normalize to `owner/repo`); `registry` → index URL + package coordinates (see registry note below); `local` → absolute or store-relative path at install time. |
| `ref` | string | no | Resolved revision: commit SHA, tag, branch, or registry version. For `git`/`github` the installer MUST resolve floating refs to a commit SHA at install time and record the SHA — reproducibility depends on it. |
| `path` | string | no | Subpath within the source where the package lives (monorepo sources), e.g. `plugins/deploy-tools`. |

Registry note (current posture): a `registry`-type source denotes an index
that resolves package coordinates to a concrete `git`/`github` source. The
first-party index is **discovery over GitHub topics** — publishers tag
extension repositories with a designated topic and the index answers
search/lookup queries from that corpus; a hosted skills.sh-style site MAY
later serve the same index. The lockfile records only the resolved source
(`type`, `uri`, `ref`), never index-internal state, so the file format is
agnostic to which index answered.

Interop note (skills.sh conventions): `uri`/`ref`/`installedAt`/`updatedAt`
follow the same semantics as `sourceUrl`/`ref`/`installedAt`/`updatedAt` in
skills.sh's lock entries, and `path` mirrors `skillPath`. An importer mapping
a skills.sh entry keeps field meanings 1:1. skills.sh's `skillFolderHash`
(GitHub tree SHA) is a *remote-side* digest; our `integrity` (§4) is a
*local-content* digest equivalent to their `computedHash` — the two are
complementary, not interchangeable, and the lockfile keeps them in separate
fields.

## 4. Integrity digests

`integrity` uses Subresource Integrity syntax
(<https://www.w3.org/TR/SRI/>): the string `sha256-` followed by the
base64-encoded SHA-256 of the package manifest-of-files.

The hashed manifest-of-files is computed over the installed tree
(`packages/<name>/`, or `skills/<name>/` for standalone skills):

1. List every regular file under the package directory, paths relative to
   the package root, `/`-separated, sorted by byte order. Symlinks are
   hashed as their target string; dangling or root-escaping symlinks abort
   the digest.
2. Emit the canonical lines `<sha256-hex-of-file-contents>  <relative-path>`,
   one per file, joined with `\n`.
3. SHA-256 that byte string; base64 the result.

An optional sibling field `treeHash` MAY record the GitHub tree SHA for
`github` sources (skills.sh `skillFolderHash` convention) to enable cheap
remote update checks without cloning.

## 5. Semantics

1. `extensions` is the authoritative inventory: an Extension not listed is
   not installed, and an entry whose directory is absent is a `doctor`
   finding, not a silent skip.
2. `extensions.lock` owns `packages/` and our slice of `skills/`: entries
   recorded with kind `skill` and a `skills/<name>/` materialization are how
   §7.3 of `store-layout.md` decides foreign-vs-managed dirs.
3. The lockfile is append-evolving: removing an entry removes the managed
   state; orphaned `packages/` dirs (no lock entry) are reported by `doctor`,
   never auto-deleted.
4. AnyHarness never writes skills.sh's `.skill-lock.json` or
   `skills-lock.json` (`store-layout.md` §5.4); ownership questions between
   the two managers are resolved by reading, not writing.
5. Unknown fields anywhere in the file MUST be preserved on rewrite where
   practical and MUST NOT be treated as errors — forward-compat for mixed
   tool versions.

## 6. Versioning

`version` is an integer bumped only on incompatible layout change.
Compatible additions (new optional fields, new `source.type` values) reuse
the current version; readers tolerate them per §5.5. A reader encountering
`version > 1` MUST refuse to write and SHOULD refuse to read.

## 7. Normative references

- `store-layout.md` — store paths, locking, `skills/` reconciliation,
  pinned types (Extension, ExtensionKind, ManifestRef).
- `manifest.md` — manifest fields behind ManifestRef, Capabilities.
- `trust.md` — integrity verification policy, attestations, audit log.
- W3C Subresource Integrity — `sha256-` digest syntax.
  <https://www.w3.org/TR/SRI/>
- skills.sh lock conventions (`vercel-labs/skills`) — `sourceUrl`, `ref`,
  `installedAt`, `skillPath`, `skillFolderHash`, `computedHash` precedent.
  <https://github.com/vercel-labs/skills>
