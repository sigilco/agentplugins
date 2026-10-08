/**
 * Pinned shared types — spec/bridge/operations.md §1, verbatim.
 * Parallel workstreams (cli, metaharness, bridge clients) code against
 * these shapes; do not rename.
 */

export type ExtensionKind =
  | "skill"
  | "mcp"
  | "plugin"
  | "hook"
  | "command"
  | "agent"
  | "rule";

export const EXTENSION_KINDS: readonly ExtensionKind[] = [
  "skill",
  "mcp",
  "plugin",
  "hook",
  "command",
  "agent",
  "rule",
];

/** Pointer to a plugin.json + version, per spec/manifest.md + spec/lockfile.md. */
export interface ManifestRef {
  /** Package name — `plugin.json` `name` field. */
  name: string;
  /** Exact installed version (semver string). */
  version: string;
  /** Integrity value as recorded in extensions.lock (e.g. "sha256-…"). Optional in-flight; always present server-side. */
  integrity?: string;
}

/** One installed unit in the store. */
export interface Extension {
  /** Stable id: "<name>@<version>" — also the extensions.lock key. */
  id: string;
  /** Primary kind (how it was installed). */
  kind: ExtensionKind;
  manifest: ManifestRef;
  enabled: boolean;
  /** All kinds of content this extension contributes — a `plugin` may provide hooks+commands+skills. */
  provides?: ExtensionKind[];
  /** Whether the negotiated client can consume it (absent = true). */
  supported?: boolean;
}

/** Host-declared feature surface — see spec/bridge/capabilities.md for slot semantics. */
export interface Capabilities {
  /** ExtensionKind values this client can consume. */
  kinds: ExtensionKind[];
  /** Hook lifecycle events this client will invoke. */
  hookEvents: string[];
  /** Host-injected environment slots. */
  slots: {
    storage: "fs" | "kv" | "none";
    secrets: "host" | "prompt" | "none";
    exec: boolean;
    skills: "read-write" | "read" | "none";
    mcp: "managed" | "external" | "none";
    [slot: string]: unknown;
  };
  experimental?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Lockfile mirror types (spec/lockfile.md §3)                          */
/* ------------------------------------------------------------------ */

export type SourceType = "git" | "github" | "registry" | "local";

/** Lockfile `source` object (lockfile.md §3.3). */
export interface SourceRef {
  type: SourceType;
  /** Canonical identifier: clone URL / `owner/repo` / index coordinates / path. */
  uri: string;
  /** Resolved revision (commit SHA, tag, registry version). */
  ref?: string;
  /** Subpath within the source holding the package (monorepo sources). */
  path?: string;
  /** The ref spelling the caller asked for, when `ref` was resolved from it. */
  requestedRef?: string;
}

export interface ComponentRef {
  kind: ExtensionKind;
  name: string;
}

/**
 * One `extensions.lock` entry. `enabled` is an additive field the schema
 * does not yet declare — see the session report (spec gap: the bridge's
 * `Extension.enabled` requires a persisted home).
 */
export interface LockEntry {
  kind: ExtensionKind;
  manifest: ManifestRef;
  source: SourceRef;
  integrity: string;
  treeHash?: string;
  installedAt: string;
  updatedAt: string;
  targets: string[];
  components?: ComponentRef[];
  capabilities?: string[];
  attestations?: object[];
  enabled?: boolean;
  [unknownField: string]: unknown; // forward-compat, preserved on rewrite
}

export interface Lockfile {
  $schema?: string;
  version: number;
  extensions: Record<string, LockEntry>;
  [unknownField: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Trust (spec/trust.md §4, §6)                                         */
/* ------------------------------------------------------------------ */

export type Actor = "user" | "agent" | "daemon";

export type ExecClass = "setup" | "hooks" | "mcp" | "skillScripts";

export type PolicyDecision = "allow" | "deny" | "ask";

export interface TrustPolicy {
  exec: {
    setup: PolicyDecision;
    hooks: PolicyDecision;
    mcp: PolicyDecision;
    skillScripts: PolicyDecision;
    /** What `ask` resolves to when no human can answer. */
    nonInteractive: "deny" | "allow";
  };
  sources: {
    allow: string[];
    deny: string[];
  };
}

export type AuditEvent =
  | "install"
  | "update"
  | "remove"
  | "integrity.verify"
  | "integrity.fail"
  | "exec.allow"
  | "exec.deny"
  | "policy.change"
  | "lockfile.corrupt"
  | "skills.conflict";

export interface AuditRecord {
  ts: string;
  event: AuditEvent;
  actor: Actor;
  extension?: ManifestRef;
  decision?: PolicyDecision;
  integrity?: string;
  source?: SourceRef;
  details?: Record<string, unknown>;
}
