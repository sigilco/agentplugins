/**
 * @any-harness/sdk — isomorphic core of the AnyHarness store / trust /
 * bridge layer. Zero node builtins imports: every IO crosses `StorePorts`
 * (ports.ts). The pinned public API for sibling packages (cli, metaharness):
 *
 *   createStore(root, ports[, options]) → Store
 *   resolveSource(input) → SourceRef
 *   handleBridgeRequest(store, req[, session]) → Promise<JsonRpcResponse>
 *
 * Store methods: list, get, install, remove, setEnabled, materialize,
 * verify, doctor (+ policy, auditLog, readLock, subscribe helpers).
 */

// Pinned API surface.
export { createStore, storePaths, SHARED_SKILLS_TARGET } from "./store.js";
export type {
  ApproveExec,
  DoctorFinding,
  DoctorReport,
  InstallOptions,
  InstallResult,
  ListOptions,
  MaterializeOptions,
  MaterializeResult,
  MaterializedSkill,
  Store,
  StoreEntry,
  StoreNotification,
  StoreOptions,
  StorePaths,
  VerifyResult,
} from "./store.js";
export { createBridgeSession, handleBridgeRequest, BRIDGE_OPS } from "./bridge.js";
export type {
  BridgeOp,
  BridgeSession,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  RequestId,
} from "./bridge.js";
export { resolveSource, cloneUrlFor } from "./sources.js";

// Ports — sibling packages implement/adapt these.
export { FsError } from "./ports.js";
export type {
  ExecOptions,
  ExecPort,
  ExecResult,
  FsDirent,
  FsPort,
  FsStat,
  McpPort,
  StorePorts,
} from "./ports.js";

// Core types (pinned bridge + lockfile + trust shapes).
export { EXTENSION_KINDS } from "./types.js";
export type {
  Actor,
  AuditEvent,
  AuditRecord,
  Capabilities,
  ComponentRef,
  Extension,
  ExtensionKind,
  LockEntry,
  Lockfile,
  ManifestRef,
  SourceRef,
  TrustPolicy,
} from "./types.js";

// Errors + utilities exposed for cli/testing.
export { StoreError } from "./errors.js";
export type { ErrorKind } from "./errors.js";
export { readLockfile, serializeLockfile, emptyLockfile, LOCKFILE_VERSION } from "./lockfile.js";
export type { LockfileRead } from "./lockfile.js";
export { computeIntegrity, listPackageFiles } from "./integrity.js";
export type { PackageFile } from "./integrity.js";
export { validateManifest, inspectPackage, isValidExtensionName, SDK_VERSION, NAMESPACE_VERSION } from "./manifest.js";
export type { HookDeclaration, McpServerDecl, PackageInspection, ParsedManifest } from "./manifest.js";
export { DEFAULT_POLICY, loadPolicy, parsePolicyText } from "./policy.js";
export type { PolicyRead } from "./policy.js";
export { sha256, toHex, toBase64, sriSha256, sha256HexOfText } from "./hash.js";
export { join, normalize, isInside, resolveInside, compareUtf8 } from "./path.js";
export { satisfiesRange, compareVersions, parseVersion } from "./semver.js";
export { globToRegExp, matchesGlob, matchesAnyGlob } from "./glob.js";
export { parseToml } from "./toml.js";
export { parseFrontmatter } from "./frontmatter.js";
export { atomicWriteFile, copyTree, renameIntoPlace, swapDirectory } from "./atomic.js";
export { withLock, lockPathFor } from "./mutex.js";
export type { MutexOptions } from "./mutex.js";
export { appendAudit, readAudit } from "./audit.js";
export {
  mergeMcpServers,
  readRootMcp,
  removeMcpServers,
  rootMcpPathFor,
} from "./mcpmerge.js";
export type { McpMergeResult, RootMcpRead } from "./mcpmerge.js";
