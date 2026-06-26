/**
 * @agentplugins/core — re-export facade
 *
 * Public API is unchanged. Internals have moved to sub-packages:
 * - @agentplugins/contract  — manifest schema + all types
 * - @agentplugins/compile   — codegen kernel, lint, validation, sanitizers
 * - @agentplugins/store     — install / link / registry (A4, coming next)
 */

// ─── Types from contract ──────────────────────────────────────────────────────

export type {
  PluginManifest,
  NativeEntry,
  TargetPlatform,
  Skill,
  Command,
  AgentDefinition,
  MCPServerConfig,
  ToolDefinition,
  ToolParameter,
  ToolContext,
  ToolResult,
  UserConfigOption,
  UniversalHooks,
  UniversalHookName,
  HookHandler,
  CommandHookHandler,
  HttpHookHandler,
  InlineHookHandler,
  ReferenceHookHandler,
  HookContext,
  HookResult,
  HookDefinition,
  HandlerType,
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
  PluginManifestSchema,
  SerializableHandlerSchema,
} from '@agentplugins/contract';

// ─── Compile kernel re-exports ────────────────────────────────────────────────

export { validateUniversal, validateForPlatform } from './validation.js';
export { lint, lintManifest } from './lint.js';
export type { LintIssue, LintRule } from './lint.js';

// ─── Store re-exports (still in core/store.ts pending A4) ────────────────────

export {
  AGENT_PATHS,
  expandHome,
  getStorePath,
  getSkillsCompatPath,
  getPluginStorePath,
  getMetaPath,
  getAgentPaths,
  detectAgents,
  getDetectedAgents,
  normalizeSource,
  extractRepoName,
  initStore,
  cloneRepo,
  pullRepo,
  findManifestInDir,
  readMeta,
  writeMeta,
  installPlugin,
  addPluginFromSource,
  removePlugin,
  listPlugins,
  getPluginInfo,
  updatePlugin,
  symlinkPlugin,
  unlinkPluginSymlink,
  linkCompiledPlugin,
  unlinkCompiledPlugin,
  linkNativeArtifacts,
  unlinkNativeArtifacts,
  linkPluginSkills,
  getSymlinks,
  getPluginDistPath,
  runDoctor,
} from './store.js';
export type {
  AgentPathEntry,
  PluginMeta,
  DetectedAgent,
  SymlinkInfo,
  InstalledPlugin,
  ManifestFindResult,
  InstallOptions,
  InstallResult,
  DoctorResult,
  DoctorIssue,
} from './store.js';

// ─── definePlugin helper ──────────────────────────────────────────────────────

import type { PluginManifest } from '@agentplugins/contract';

export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}
