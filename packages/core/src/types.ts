/**
 * AgentPlugins Core Types
 *
 * The Port: Universal plugin interface abstracting across all AI agent harnesses.
 * Think of this as the "LLVM IR" of AI agent plugins — one unified representation
 * that compiles to any target platform.
 */

// ─── Manifest ─────────────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Plugin identifier — kebab-case, max 64 chars */
  name: string;
  /** Semantic version */
  version: string;
  /** Short description */
  description: string;

  // Metadata
  displayName?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  /** Whether plugin is enabled by default (Claude, Kimi) */
  defaultEnabled?: boolean;

  // Features
  skills?: Skill[];
  hooks?: UniversalHooks;
  commands?: Command[];
  agents?: AgentDefinition[];
  mcpServers?: Record<string, MCPServerConfig>;
  tools?: ToolDefinition[];
  /** Named user-configurable options (displayed in UI, stored per-harness). */
  userConfig?: Record<string, UserConfigOption>;

  metadata?: Record<string, unknown>;

  /**
   * Explicit capability opt-ins required for otherwise-restricted operations.
   * Currently recognised values: `'subprocess'` (unlocks child_process usage in lint).
   */
  capabilities?: string[];

  // Build configuration
  /** Target platforms to compile for (if omitted, compiles for all) */
  targets?: TargetPlatform[];
  /**
   * Escape hatch: supply a hand-written native file for a code-emitting adapter.
   * When set, the adapter copies the specified file verbatim into dist/<target>/
   * instead of running codegen. Paths are relative to the plugin root.
   */
  nativeEntry?: NativeEntry;

  /**
   * Per-harness runtime adapter overrides. At runtime the generated code tries
   * to `import()` the specified file; if found it replaces the built-in adapter
   * logic. Lets authors pin to a specific SDK version or swap implementations
   * when upstream harness APIs change. Paths are relative to the plugin root.
   * Only meaningful for code-emitting adapters (pimono, opencode).
   */
  adapterOverrides?: Partial<Record<TargetPlatform, string>>;

  // v1.1 extensions
  /** Runtime dependencies (npm packages or external binaries) */
  dependencies?: Dependency[];
  /** Long-running companion process */
  sidecar?: Sidecar;
  /** SHA-256 of the plugin source tarball; verified at install time */
  integrity?: string;
}

// ─── v1.1 Dependency & Sidecar Types ───────────────────────────────────────

export type Dependency =
  | { type: 'npm'; name: string; version?: string }
  | { type: 'binary'; name: string; required?: boolean };

export interface Sidecar {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  port?: number;
  health?: string;
  restart?: 'always' | 'on-failure' | 'no';
}

/** Paths to hand-written native files for code-emitting adapters (escape hatch). */
export interface NativeEntry {
  /** Path (relative to plugin root) to a TS file loaded verbatim by the pimono adapter. */
  pimono?: string;
  /** Path (relative to plugin root) to a TS file loaded verbatim by the opencode adapter. */
  opencode?: string;
}

export type TargetPlatform =
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'gemini'
  | 'kimi'
  | 'opencode'
  | 'pimono';

export const ALL_TARGETS: TargetPlatform[] = [
  'claude',
  'codex',
  'copilot',
  'gemini',
  'kimi',
  'opencode',
  'pimono',
];

// ─── Skills ───────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  description: string;
  /** Markdown content or path to SKILL.md */
  content?: string;
  /** File path (relative) to SKILL.md */
  filePath?: string;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export interface Command {
  /** Slash command name (without /) */
  name: string;
  description?: string;
  /** Prompt template injected when the command is invoked */
  prompt?: string;
  /** Hint shown in the command picker for expected argument(s) */
  argumentHint?: string;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface AgentDefinition {
  name: string;
  description?: string;
  /** System prompt / behaviour spec for this subagent */
  prompt?: string;
  /** Explicit tool allow-list (harness-specific names) */
  tools?: string[];
  /** Path to a SKILL.md that defines this agent (alternative to prompt) */
  filePath?: string;
}

// ─── MCP Servers ──────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  handler?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolContext {
  sessionId?: string;
  messageId?: string;
  agent?: string;
  directory?: string;
  worktree?: string;
}

export type ToolResult = string | {
  title?: string;
  output: string;
  metadata?: Record<string, unknown>;
};

// ─── User Config ──────────────────────────────────────────────────────────────

export interface UserConfigOption {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;
  description: string;
  /** If true, value is stored in secure storage (keychain) */
  sensitive?: boolean;
  required?: boolean;
  default?: unknown;
  multiple?: boolean;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** The maximal common hook subset across all platforms */
export interface UniversalHooks {
  // Session lifecycle
  sessionStart?: HookDefinition;
  sessionEnd?: HookDefinition;

  // Prompt lifecycle
  userPromptSubmit?: HookDefinition;
  userPromptExpansion?: HookDefinition;

  // Tool lifecycle
  preToolUse?: HookDefinition;
  postToolUse?: HookDefinition;
  postToolUseFailure?: HookDefinition;

  // Permission
  permissionRequest?: HookDefinition;
  permissionDenied?: HookDefinition;

  // Subagent lifecycle
  subagentStart?: HookDefinition;
  subagentStop?: HookDefinition;

  // Context management
  preCompact?: HookDefinition;
  postCompact?: HookDefinition;

  // Turn lifecycle
  stop?: HookDefinition;
  stopFailure?: HookDefinition;

  // Notification
  notification?: HookDefinition;

  // File/events (Claude-specific but useful)
  fileChanged?: HookDefinition;
  cwdChanged?: HookDefinition;
  setup?: HookDefinition;
}

/** Every universal hook name */
export type UniversalHookName = keyof UniversalHooks;

/** All universal hook names as an array */
export const UNIVERSAL_HOOK_NAMES: UniversalHookName[] = [
  'sessionStart',
  'sessionEnd',
  'userPromptSubmit',
  'userPromptExpansion',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'permissionRequest',
  'permissionDenied',
  'subagentStart',
  'subagentStop',
  'preCompact',
  'postCompact',
  'stop',
  'stopFailure',
  'notification',
  'fileChanged',
  'cwdChanged',
  'setup',
];

// ─── Hook Definition ──────────────────────────────────────────────────────────

export interface HookDefinition {
  /** Filter to narrow when the hook fires (tool name pattern, etc.) */
  matcher?: string;
  /** The handler implementation */
  handler: HookHandler;
}

export type HookHandler =
  | CommandHookHandler
  | HttpHookHandler
  | InlineHookHandler
  | ReferenceHookHandler;

export interface CommandHookHandler {
  type: 'command';
  /** Shell command to execute */
  command: string;
  /** Optional status message shown while hook runs */
  statusMessage?: string;
  /** Shell to use */
  shell?: 'bash' | 'powershell' | 'cmd';
}

export interface HttpHookHandler {
  type: 'http';
  /** URL to POST hook context to */
  url: string;
  /** Optional headers */
  headers?: Record<string, string>;
}

export interface InlineHookHandler {
  type: 'inline';
  /** Inline function — will be wrapped for command-based platforms */
  handler: (ctx: HookContext) => Promise<HookResult>;
}

export interface ReferenceHookHandler {
  type: 'reference';
  /** Reference to a named export or file path. Adapters generate a proxy call. */
  reference: string;
  /** Optional source file to import the reference from */
  source?: string;
}

// ─── Hook Context & Result ────────────────────────────────────────────────────

export interface HookContext {
  /** The hook event name */
  event: string;
  /** Current working directory */
  cwd: string;
  /** Session identifier */
  sessionId?: string;
  /** Active model name */
  model?: string;
  /** Permission mode */
  permissionMode?: string;
  /** For tool-related hooks: tool name */
  toolName?: string;
  /** For tool-related hooks: tool arguments */
  toolInput?: unknown;
  /** For prompt-related hooks: the user's prompt */
  userPrompt?: string;
  /** Session source (startup, resume, clear, compact) */
  source?: string;
  /** Path to transcript file */
  transcriptPath?: string | null;
  /** Agent identifier */
  agentId?: string;
  /** Agent type/profile */
  agentType?: string;
  /** Turn identifier */
  turnId?: string;
  /** For subagent hooks: the CLI command used to spawn the child agent */
  agentCommand?: string;
  /** For subagent hooks: working directory of the child agent process */
  agentCwd?: string;
}

export interface HookResult {
  /** If false, stops further processing (blocking hooks) */
  continue?: boolean;
  /** System message surfaced in UI */
  systemMessage?: string;
  /** Additional context injected into session */
  additionalContext?: string;
  /** If true, blocks the operation */
  block?: boolean;
  /** Reason for blocking */
  reason?: string;
  /** Suppress tool output */
  suppressOutput?: boolean;
  /**
   * When returned from a `stop` hook, enqueues this string as a new user
   * message, causing the agent to continue working. The spec guarantees that
   * `userPromptSubmit` fires on the enqueued message.
   *
   * Implemented natively on pimono (pi.sendUserMessage) and opencode.
   * JSON-emitting adapters pass the field through in stdout JSON — Claude/Codex
   * harness support depends on harness version; see the compat matrix.
   *
   * Safety: always pair with an exit condition (e.g. a `goal_complete` tool)
   * to avoid runaway loops.
   */
  continueWith?: string;
}

// ─── Adapter Contract ─────────────────────────────────────────────────────────

export interface PlatformAdapter {
  /** Internal name */
  readonly name: TargetPlatform;
  /** Human-readable name */
  readonly displayName: string;
  /** Which universal hooks this platform supports */
  readonly supportedHooks: readonly UniversalHookName[];
  /** Which handler types this platform supports */
  readonly supportedHandlers: readonly HandlerType[];
  /** Path to manifest file (relative to plugin root) */
  readonly manifestPath: string;
  /** Manifest file format (json, toml, etc.) */
  readonly manifestFormat: 'json' | 'toml';

  /** Validate a plugin for this platform, returning any issues */
  validate(plugin: PluginManifest): ValidationIssue[];

  /** Compile the universal plugin into platform-specific output */
  compile(plugin: PluginManifest): AdapterOutput;
}

export type HandlerType = 'command' | 'http' | 'inline' | 'reference';

export enum Severity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface ValidationIssue {
  severity: Severity;
  field?: string;
  message: string;
  suggestion?: string;
}

/** Instructs the CLI to copy a source file verbatim rather than generating content. */
export interface NativeCopy {
  /** Relative path from the plugin root of the source file. */
  from: string;
  /** Destination filename within `dist/<target>/`. */
  to: string;
}

export interface AdapterOutput {
  files: FileOutput[];
  manifest: Record<string, unknown>;
  warnings: string[];
  issues: ValidationIssue[];
  postInstall?: string[];
  /** Verbatim file copies requested by a native-entry passthrough. Resolved by the CLI. */
  nativeCopies?: NativeCopy[];
}

export interface FileOutput {
  /** File path relative to plugin root */
  path: string;
  /** File content */
  content: string;
}

// ─── Build Configuration ──────────────────────────────────────────────────────

export interface BuildConfig {
  /** Path to plugin definition file */
  entry: string;
  /** Output directory */
  outDir: string;
  /** Target platforms (defaults to all) */
  targets?: TargetPlatform[];
  /** Whether to fail on warnings */
  strict?: boolean;
  /** Log level */
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

// ─── Utility Types ────────────────────────────────────────────────────────────

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
