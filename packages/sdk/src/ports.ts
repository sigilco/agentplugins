/**
 * Environment ports — the only way `packages/sdk` touches the outside.
 * The isomorphic rule (AGENTS.md §2) bans node builtins imports here, so every
 * filesystem/process interaction goes through a host-injected port.
 * `packages/cli` owns the node-backed implementations; tests use the
 * in-memory fakes exported from `./testing`.
 */

export type FsEntryType = "file" | "directory" | "symlink" | "other";

export interface FsStat {
  type: FsEntryType;
  /** Byte length for regular files; 0 otherwise. */
  size: number;
  /** Modification time, ms since epoch. 0 when the port cannot report it. */
  mtimeMs: number;
}

export interface FsDirent {
  name: string;
  type: FsEntryType;
}

export class FsError extends Error {
  readonly code: "not-found" | "exists" | "not-directory" | "is-directory" | "not-empty" | "io";
  readonly path: string;
  constructor(code: FsError["code"], path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = "FsError";
    this.code = code;
    this.path = path;
  }
}

/**
 * Ambient cross-runtime globals this package relies on
 * (TextEncoder/TextDecoder/URL/setTimeout/crypto/btoa) — present in node
 * ≥11, every browser, and every worker runtime. They come from the
 * package tsconfig's `lib: ["DOM"]` (self-check) or the consumer's
 * @types/node — never declared here, where they would collide with
 * either.
 */

/**
 * Minimal filesystem surface the store needs. All paths are absolute,
 * `/`-separated logical paths; non-POSIX ports translate internally.
 *
 * Contracts the port MUST honor:
 * - `rename` is atomic for same-directory moves (the store's atomic-write
 *   protocol — store-layout.md §7.1 — stages a sibling temp then renames).
 * - `createExclusive` creates the file only when it does not exist
 *   (O_EXCL semantics) and returns whether it won; this is the `.lock`
 *   mutex primitive (store-layout.md §7.2).
 * - `stat` does NOT follow symlinks (lstat semantics) — integrity and
 *   containment depend on seeing the symlink itself.
 * - `appendFile` appends atomically where the platform allows
 *   (O_APPEND), so concurrent audit writers never interleave mid-line.
 */
export interface FsPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** mkdir -p: creates missing parents; succeeds when already present. */
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Recursive removal; missing paths succeed silently. */
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<FsStat | null>;
  readDir(path: string): Promise<FsDirent[]>;
  /** Target string of a symlink (raw, possibly relative). */
  readlink(path: string): Promise<string>;
  createExclusive(path: string, data: Uint8Array): Promise<boolean>;
  appendFile(path: string, data: Uint8Array): Promise<void>;
  /**
   * Optional `ln -s` primitive. Absent ports dereference on copy (with a
   * containment check); present ports preserve link identity so package
   * trees keep their symlink semantics through installs and
   * materialization.
   */
  symlink?(target: string, path: string): Promise<void>;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Bytes delivered to the process's stdin. */
  stdin?: string | Uint8Array;
  timeoutMs?: number;
}

/**
 * Process execution — command discipline follows Agent Plugins §7.2.1:
 * `command` is one executable token, `args` are passed separately,
 * never a shell string. Hosts without processes (browser bundles)
 * inject no ExecPort; call sites degrade via the trust policy, not
 * branches on the environment.
 */
export interface ExecPort {
  run(
    command: string,
    args?: string[],
    opts?: ExecOptions,
  ): Promise<ExecResult>;
}

/**
 * Optional MCP passthrough port. The v0 sdk cannot drive MCP servers from
 * `ExecPort` alone (a one-shot `run` cannot hold an MCP session open), so
 * `tools.call` answers `capability-unsupported` / `transport-unavailable`
 * until a host injects one.
 */
export interface McpPort {
  call(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

/** Pinned shape — W9 (cli) implements these against node. */
export interface StorePorts {
  fs: FsPort;
  exec: ExecPort;
  /** Optional; absence is declared to bridge clients via the `mcp` slot. */
  mcp?: McpPort;
}
