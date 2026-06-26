/**
 * Re-exports from @agentplugins/contract.
 *
 * Core is the public-facing facade; contract is the single source of truth
 * for all manifest types. This file is a stable re-export bridge so that
 * existing `@agentplugins/core` imports continue to resolve without changes.
 */

export type {
  TargetPlatform,
  Dependency,
  Sidecar,
  Skill,
  Command,
  AgentDefinition,
  MCPServerConfig,
  ToolParameter,
  ToolContext,
  ToolResult,
  ToolDefinition,
  UserConfigOption,
  NativeEntry,
  HookContext,
  HookResult,
  CommandHookHandler,
  HttpHookHandler,
  ReferenceHookHandler,
  InlineHookHandler,
  HookHandler,
  HandlerType,
  HookDefinition,
  UniversalHookName,
  UniversalHooks,
  PluginManifest,
  ValidationIssue,
  NativeCopy,
  FileOutput,
  AdapterOutput,
  PlatformAdapter,
  BuildConfig,
  DeepPartial,
  CompileOptions,
} from '@agentplugins/contract';

export {
  Severity,
  ALL_TARGETS,
  UNIVERSAL_HOOK_NAMES,
} from '@agentplugins/contract';
