/**
 * @agentplugins/contract — Zod manifest schema
 *
 * Single source of truth. TypeScript types are derived via z.infer<>.
 * JSON Schema is generated at build time via generate-schema.ts.
 *
 * InlineHookHandler carries a runtime function — excluded from the serializable
 * discriminated union and defined as a hand-written TS type below.
 */

import { z } from 'zod';

// ─── Target platform ──────────────────────────────────────────────────────────

export const TargetPlatformSchema = z.enum([
  'claude',
  'codex',
  'copilot',
  'gemini',
  'kimi',
  'opencode',
  'pimono',
]);
export type TargetPlatform = z.infer<typeof TargetPlatformSchema>;

export const ALL_TARGETS: TargetPlatform[] = [
  'claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono',
];

// ─── Dependency & Sidecar ────────────────────────────────────────────────────

export const DependencySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('npm'), name: z.string(), version: z.string().optional() }),
  z.object({ type: z.literal('binary'), name: z.string(), required: z.boolean().optional() }),
]);
export type Dependency = z.infer<typeof DependencySchema>;

export const SidecarSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  port: z.number().optional(),
  health: z.string().optional(),
  restart: z.enum(['always', 'on-failure', 'no']).optional(),
});
export type Sidecar = z.infer<typeof SidecarSchema>;

// ─── Skill ────────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string().optional(),
  filePath: z.string().optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

// ─── Command ──────────────────────────────────────────────────────────────────

export const CommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  argumentHint: z.string().optional(),
});
export type Command = z.infer<typeof CommandSchema>;

// ─── Agent definition ─────────────────────────────────────────────────────────

export const AgentDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
  filePath: z.string().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

// ─── MCP server ───────────────────────────────────────────────────────────────

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(['stdio', 'http']).optional(),
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// ─── Tool ─────────────────────────────────────────────────────────────────────

export type ToolParameter = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
};

export const ToolParameterSchema: z.ZodType<ToolParameter> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    items: ToolParameterSchema.optional(),
    properties: z.record(ToolParameterSchema).optional(),
    required: z.array(z.string()).optional(),
  })
);

export const ToolParameterSchemaMapSchema = z.object({
  type: z.literal('object'),
  properties: z.record(ToolParameterSchema),
  required: z.array(z.string()).optional(),
});

export const ToolContextSchema = z.object({
  sessionId: z.string().optional(),
  messageId: z.string().optional(),
  agent: z.string().optional(),
  directory: z.string().optional(),
  worktree: z.string().optional(),
});
export type ToolContext = z.infer<typeof ToolContextSchema>;

export type ToolResult = string | {
  title?: string;
  output: string;
  metadata?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  handler?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

// ─── User config ──────────────────────────────────────────────────────────────

export const UserConfigOptionSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'directory', 'file']),
  title: z.string(),
  description: z.string(),
  sensitive: z.boolean().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  multiple: z.boolean().optional(),
});
export type UserConfigOption = z.infer<typeof UserConfigOptionSchema>;

// ─── Native entry (escape hatch) ──────────────────────────────────────────────

export const NativeEntrySchema = z.object({
  pimono: z.string().optional(),
  opencode: z.string().optional(),
});
export type NativeEntry = z.infer<typeof NativeEntrySchema>;

// ─── Hook context & result ────────────────────────────────────────────────────

export const HookContextSchema = z.object({
  event: z.string(),
  cwd: z.string(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  toolName: z.string().optional(),
  toolInput: z.unknown().optional(),
  userPrompt: z.string().optional(),
  source: z.string().optional(),
  transcriptPath: z.string().nullable().optional(),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
  turnId: z.string().optional(),
  agentCommand: z.string().optional(),
  agentCwd: z.string().optional(),
});
export type HookContext = z.infer<typeof HookContextSchema>;

export const HookResultSchema = z.object({
  continue: z.boolean().optional(),
  systemMessage: z.string().optional(),
  additionalContext: z.string().optional(),
  block: z.boolean().optional(),
  reason: z.string().optional(),
  suppressOutput: z.boolean().optional(),
  continueWith: z.string().optional(),
});
export type HookResult = z.infer<typeof HookResultSchema>;

// ─── Hook handlers (serializable subset) ─────────────────────────────────────

export const CommandHandlerSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  statusMessage: z.string().optional(),
  shell: z.enum(['bash', 'powershell', 'cmd']).optional(),
});
export type CommandHookHandler = z.infer<typeof CommandHandlerSchema>;

export const HttpHandlerSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string()).optional(),
});
export type HttpHookHandler = z.infer<typeof HttpHandlerSchema>;

export const ReferenceHandlerSchema = z.object({
  type: z.literal('reference'),
  reference: z.string(),
  source: z.string().optional(),
});
export type ReferenceHookHandler = z.infer<typeof ReferenceHandlerSchema>;

export const SerializableHandlerSchema = z.discriminatedUnion('type', [
  CommandHandlerSchema,
  HttpHandlerSchema,
  ReferenceHandlerSchema,
]);
export type SerializableHookHandler = z.infer<typeof SerializableHandlerSchema>;

/** Runtime-only — not in JSON schema; zod can't meaningfully validate functions. */
export type InlineHookHandler = {
  type: 'inline';
  handler: (ctx: HookContext) => Promise<HookResult>;
};

export type HookHandler = SerializableHookHandler | InlineHookHandler;
export type HandlerType = 'command' | 'http' | 'inline' | 'reference';

// ─── Hook definition ──────────────────────────────────────────────────────────

export const HookDefinitionSchema = z.object({
  matcher: z.string().optional(),
  handler: SerializableHandlerSchema,
});

/** Full runtime type — handler may be inline (function). */
export type HookDefinition = {
  matcher?: string;
  handler: HookHandler;
};

// ─── Universal hooks ──────────────────────────────────────────────────────────

const HookDefOpt = HookDefinitionSchema.optional();

export const UniversalHooksSchema = z.object({
  sessionStart: HookDefOpt,
  sessionEnd: HookDefOpt,
  userPromptSubmit: HookDefOpt,
  userPromptExpansion: HookDefOpt,
  preToolUse: HookDefOpt,
  postToolUse: HookDefOpt,
  postToolUseFailure: HookDefOpt,
  permissionRequest: HookDefOpt,
  permissionDenied: HookDefOpt,
  subagentStart: HookDefOpt,
  subagentStop: HookDefOpt,
  preCompact: HookDefOpt,
  postCompact: HookDefOpt,
  stop: HookDefOpt,
  stopFailure: HookDefOpt,
  notification: HookDefOpt,
  fileChanged: HookDefOpt,
  cwdChanged: HookDefOpt,
  setup: HookDefOpt,
});

export type UniversalHookName = keyof typeof UniversalHooksSchema.shape;
export const UNIVERSAL_HOOK_NAMES: UniversalHookName[] = Object.keys(
  UniversalHooksSchema.shape
) as UniversalHookName[];

/**
 * Runtime UniversalHooks — hook definitions may carry inline function handlers.
 */
export type UniversalHooks = {
  [K in UniversalHookName]?: HookDefinition;
};

// ─── Plugin manifest ──────────────────────────────────────────────────────────

/**
 * Serializable subset of PluginManifest (functions excluded).
 * Used for JSON Schema generation and JSON manifest validation.
 */
export const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),

  displayName: z.string().optional(),
  author: z.union([
    z.string(),
    z.object({ name: z.string(), email: z.string().optional(), url: z.string().optional() }),
  ]).optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  defaultEnabled: z.boolean().optional(),

  skills: z.array(SkillSchema).optional(),
  hooks: UniversalHooksSchema.optional(),
  commands: z.array(CommandSchema).optional(),
  agents: z.array(AgentDefinitionSchema).optional(),
  mcpServers: z.record(MCPServerConfigSchema).optional(),
  userConfig: z.record(UserConfigOptionSchema).optional(),
  metadata: z.record(z.unknown()).optional(),

  capabilities: z.array(z.string()).optional(),
  targets: z.array(TargetPlatformSchema).optional(),
  nativeEntry: NativeEntrySchema.optional(),
  adapterOverrides: z.record(TargetPlatformSchema, z.string()).optional(),

  dependencies: z.array(DependencySchema).optional(),
  /** @experimental No enforcement path exists yet; treat as documentation only. */
  sidecar: SidecarSchema.optional(),
  integrity: z.string().optional(),
});

/**
 * Full runtime PluginManifest — hooks may carry inline function handlers.
 * tools[] may carry runtime handler functions.
 */
export type PluginManifest = Omit<z.infer<typeof PluginManifestSchema>, 'hooks'> & {
  hooks?: UniversalHooks;
  tools?: ToolDefinition[];
};

// ─── Adapter contract ─────────────────────────────────────────────────────────

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

export interface NativeCopy {
  from: string;
  to: string;
}

export interface FileOutput {
  path: string;
  content: string;
}

export interface AdapterOutput {
  files: FileOutput[];
  manifest: Record<string, unknown>;
  warnings: string[];
  issues: ValidationIssue[];
  postInstall?: string[];
  nativeCopies?: NativeCopy[];
}

export interface PlatformAdapter {
  readonly name: TargetPlatform;
  readonly displayName: string;
  readonly supportedHooks: readonly UniversalHookName[];
  readonly supportedHandlers: readonly HandlerType[];
  readonly manifestPath: string;
  readonly manifestFormat: 'json' | 'toml';
  validate(plugin: PluginManifest): ValidationIssue[];
  compile(plugin: PluginManifest): AdapterOutput;
}

// ─── Build config ─────────────────────────────────────────────────────────────

export interface BuildConfig {
  entry: string;
  outDir: string;
  targets?: TargetPlatform[];
  strict?: boolean;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
