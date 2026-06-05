/**
 * AgentBridge Core
 *
 * The Port — universal plugin interface for AI agent harnesses.
 */

// Types
export type {
  PluginManifest,
  TargetPlatform,
  Skill,
  MCPServerConfig,
  ToolDefinition,
  ToolParameterSchema,
  ToolParameter,
  ToolContext,
  ToolResult,
  UserConfigOption,
  UniversalHooks,
  UniversalHookName,
  HookDefinition,
  HookHandler,
  CommandHookHandler,
  HttpHookHandler,
  InlineHookHandler,
  HookContext,
  HookResult,
  PlatformAdapter,
  HandlerType,
  ValidationIssue,
  AdapterOutput,
  FileOutput,
  BuildConfig,
} from './types.js';

export type { FileOutput as AdapterFile } from './types.js';
export { Severity } from './types.js';

// Import PluginManifest for the definePlugin function (value-level usage)
import type { PluginManifest } from './types.js';

// Constants
export { ALL_TARGETS, UNIVERSAL_HOOK_NAMES } from './types.js';

// Validation
export {
  validateUniversal,
  validateForPlatform,
  getPlatformConstraints,
} from './validation.js';
export type { PlatformConstraints } from './validation.js';

// Registry
export {
  registerAdapter,
  hasAdapter,
  loadAdapter,
  loadAllAdapters,
  getRegisteredPlatforms,
  registerBuiltinAdapters,
} from './registry.js';

// Hook Wrapper Generation
export {
  generateHookWrapper,
  generateHandlersModule,
  serializeHandler,
} from './hook-wrapper.js';
export type { WrapperOptions } from './hook-wrapper.js';

/**
 * Convenience function to define a plugin with TypeScript intellisense.
 */
export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}
