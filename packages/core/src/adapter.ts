/**
 * AgentPlugins Adapter Layer
 *
 * For adapter developers building platform-specific compilers.
 */

// Types
export type {
  PlatformAdapter,
  AdapterOutput,
  FileOutput,
  HandlerType,
  ValidationIssue,
  BuildConfig,
  UniversalHookName,
  HookDefinition,
} from './types.js';

export type { FileOutput as AdapterFile } from './types.js';

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
  getRegistryApp,
} from './registry.js';

// Hook Wrapper Generation
export {
  generateHookWrapper,
  generateHandlersModule,
  serializeHandler,
} from './hook-wrapper.js';
export type { WrapperOptions } from './hook-wrapper.js';

// Codegen — multi-language CodeEmitter abstraction
export {
  extractCompiledHooks,
  getEmitter,
  TypeScriptEmitter,
  JavaScriptEmitter,
  GoEmitter,
} from './codegen.js';
export type {
  EmitLanguage,
  CompiledHook,
  CodeEmitter,
} from './codegen.js';
