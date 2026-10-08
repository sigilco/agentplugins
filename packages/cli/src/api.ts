/**
 * Cli-facing view of the `@any-harness/sdk` surface.
 *
 * Wave-2 reconciliation: W8 landed the canonical types in `packages/sdk`
 * — this file now re-exports them type-only (erased at compile time, so
 * `sdk-bind.ts` stays the ONE runtime importer). Anything the cli needs
 * that the sdk does not export stays defined here.
 *
 * Bridge wire types (`Extension`, `ExtensionKind`, `ManifestRef`) are
 * pinned verbatim by `spec/bridge/operations.md` §1 — the sdk owns them.
 */

// Re-exported for cli consumers (type-only — erased, so sdk-bind stays
// the single runtime importer).
export type {
  Actor,
  ApproveExec,
  AuditEvent,
  AuditRecord,
  DoctorFinding,
  DoctorReport,
  ExecOptions,
  ExecPort,
  ExecResult,
  Extension,
  ExtensionKind,
  FsDirent,
  FsPort,
  FsStat,
  InstallOptions,
  InstallResult,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  ListOptions,
  ManifestRef,
  MaterializeOptions,
  MaterializeResult,
  SourceRef,
  Store,
  StoreEntry,
  StoreNotification,
  StoreOptions,
  StorePaths,
  StorePorts,
  TrustPolicy,
  VerifyResult,
} from "@any-harness/sdk";

// Local aliases for use in this file's own declarations (re-exports do
// not bind names in-module).
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SourceRef,
  Store,
  StoreOptions,
  StorePorts,
} from "@any-harness/sdk";

/** Alias kept for the cli's envelope terminology (sdk name: JsonRpcError). */
export type { JsonRpcError as JsonRpcErrorBody } from "@any-harness/sdk";

/* ── cli-local constants (pinned by spec/bridge/operations.md) ──────── */

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

/** The pinned sdk surface the cli binds to (see sdk-bind.ts). */
export interface SdkApi {
  createStore(
    root: string,
    ports: StorePorts,
    options?: StoreOptions,
  ): Store;
  resolveSource(input: string): SourceRef;
  handleBridgeRequest(
    store: Store,
    req: JsonRpcRequest,
  ): Promise<JsonRpcResponse>;
}
