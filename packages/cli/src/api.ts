/**
 * Pinned cross-workstream API surface for `@any-harness/sdk`.
 *
 * These names are the Wave-2 interface pin from
 * `.agents/plans/2026-10-07-v2-foundation.md`: both the sdk (W8) and the cli
 * (W9) code against them and drift is reconciled at merge. The method-level
 * shapes below are the cli-side reading of that pin — the canonical
 * definitions land with the sdk; until then `sdk-bind.ts` casts through
 * `unknown` so this file is the single point of drift.
 *
 * Bridge wire types (`Extension`, `ExtensionKind`, `ManifestRef`) are pinned
 * verbatim by `spec/bridge/operations.md` §1.
 */

export type ExtensionKind =
  | "skill"
  | "mcp"
  | "plugin"
  | "hook"
  | "command"
  | "agent"
  | "rule";

/** Pointer to a plugin.json + version, per spec/manifest.md + spec/lockfile.md. */
export interface ManifestRef {
  name: string;
  version: string;
  /** Integrity value as recorded in extensions.lock (e.g. "sha256-…"). */
  integrity?: string;
}

/** One installed unit in the store (spec/bridge/operations.md §1). */
export interface Extension {
  /** Stable id: "<name>@<version>" — also the extensions.lock key. */
  id: string;
  kind: ExtensionKind;
  manifest: ManifestRef;
  enabled: boolean;
  provides?: ExtensionKind[];
  supported?: boolean;
}

/** Source coordinates produced by `resolveSource` (spec/lockfile.md §3.3). */
export interface SourceRef {
  type: "git" | "github" | "registry" | "local";
  /** Canonical source identifier for its type. */
  uri: string;
  /** Floating ref to pin at install (branch/tag); resolved to a SHA by install. */
  ref?: string;
  /** Subpath within the source where the package lives (monorepo sources). */
  path?: string;
}

/** Who invoked a mutating operation (spec/trust.md §4.2 audit `actor`). */
export type Actor = "user" | "agent" | "daemon";

export interface InstallOptions {
  /** Materialization target for skill-kind components (store-layout.md §5.1). */
  skillTarget?: "shared" | "store";
  /** Audit actor classification; the store records it on trust events. */
  actor?: Actor;
}

export interface VerifyResult {
  ok: boolean;
  /** Integrity recorded in extensions.lock. */
  expected?: string;
  /** Integrity recomputed over the installed tree. */
  actual?: string;
  details?: string;
}

export interface DoctorFinding {
  severity: "info" | "warn" | "error";
  /** Stable kebab-case finding code (e.g. "lock-corrupt", "orphan-package"). */
  code: string;
  message: string;
  path?: string;
  extension?: string;
}

export interface DoctorReport {
  ok: boolean;
  findings: DoctorFinding[];
}

/** The store object `createStore` returns (pinned method names). */
export interface Store {
  list(): Promise<Extension[]>;
  install(source: SourceRef, opts?: InstallOptions): Promise<Extension>;
  remove(name: string): Promise<void>;
  setEnabled(name: string, enabled: boolean): Promise<Extension>;
  materialize(name: string): Promise<{ materializedTo: string[] }>;
  verify(name: string): Promise<VerifyResult>;
  doctor(): Promise<DoctorReport>;
}

/**
 * Filesystem port — the only fs the sdk store ever sees. Implemented over
 * `node:fs` here; the sdk ships an in-memory implementation for tests and
 * browser/kv hosts provide their own.
 *
 * Member-level shape is provisional pending W8: names chosen to cover the
 * L0 requirements (atomic staged writes, lockfile/digest reads, skills/
 * materialization, symlink-with-copy-fallback).
 */
export interface FsPort {
  /** UTF-8 file contents; throws `not-found` when absent. */
  readFile(path: string): Promise<string>;
  /** Raw bytes for digest computation (spec/lockfile.md §4). */
  readFileBytes(path: string): Promise<Uint8Array>;
  /** Create parent dirs and write; implementations SHOULD write atomically
   * (sibling temp + rename per store-layout.md §7.1). */
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  /** Append UTF-8 bytes (audit.log `O_APPEND` semantics). */
  appendFile(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{
    kind: "file" | "directory" | "symlink" | "other";
    size: number;
    mtimeMs: number;
  }>;
  /** Entry names (not full paths) inside a directory; throws when absent. */
  list(path: string): Promise<string[]>;
  /** `mkdir -p` semantics; no error when already present. */
  mkdir(path: string): Promise<void>;
  /** Recursive remove; no error when absent. */
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /**
   * Create `path` as a symlink to `target`. Implementations without symlink
   * support (scriptc island: no `symlinkSync`) MAY throw; callers fall back
   * to copying per the `ln`+copy rule in AGENTS.md §7.
   */
  symlink?(target: string, path: string): Promise<void>;
  readlink?(path: string): Promise<string>;
  /** Recursive copy of a file or directory tree (symlink fallback path). */
  copy(from: string, to: string): Promise<void>;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Kill the process after this many ms; result reports a non-zero code. */
  timeoutMs?: number;
}

/**
 * Process port — git ops shell out to the `git` binary per AGENTS.md §7;
 * `exec` takes one executable token + argv (no shell), `run` is the
 * shell-string convenience form for trusted, internally-built commands.
 */
export interface ExecPort {
  exec(file: string, args?: string[], opts?: ExecOptions): Promise<ExecResult>;
  run(command: string, opts?: ExecOptions): Promise<ExecResult>;
}

/** Pinned: `createStore(root, ports)` — the host injects both ports. */
export interface StorePorts {
  fs: FsPort;
  exec: ExecPort;
}

/* ── JSON-RPC envelope (spec/bridge/protocol.md §2) ─────────────────── */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  /** Absent on notifications. */
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcErrorBody;
}

/** Pinned bridge ops (spec/bridge/operations.md). */
export const BRIDGE_METHODS = [
  "capabilities.negotiate",
  "extensions.list",
  "extensions.get",
  "hooks.invoke",
  "commands.resolve",
  "skills.materialize",
  "tools.call",
  "events.notify",
] as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

/** Ops always permitted regardless of caller scope (transports.md §3.3). */
export const ALWAYS_ALLOWED_METHODS: ReadonlySet<string> = new Set([
  "capabilities.negotiate",
  "events.notify",
]);

/** The full pinned sdk surface the cli binds to (see sdk-bind.ts). */
export interface SdkApi {
  createStore(root: string, ports: StorePorts): Store;
  resolveSource(input: string): SourceRef;
  handleBridgeRequest(
    store: Store,
    req: JsonRpcRequest,
  ): Promise<JsonRpcResponse>;
}
