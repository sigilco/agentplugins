/**
 * @agentplugins/core — re-export facade
 *
 * Public API is unchanged. Internals have moved to sub-packages:
 * - @agentplugins/contract  — manifest schema + all types
 * - @agentplugins/compile   — codegen kernel, lint, validation, sanitizers
 * - @agentplugins/store     — install / link / registry (extracted in v0.5.0)
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

// ─── Store re-exports (from @agentplugins/store) ─────────────────────────────

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
  unlinkAll,
  recordLinkError,
  flushLinkErrors,
  validateCloneUrl,
  resolveSetupCommand,
  hashSetupCommand,
  gateSetupCommand,
  runSetupCommand,
  readSetupRecord,
  writeSetupRecord,
} from '@agentplugins/store';
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
  SetupRecord,
  SetupSource,
  ResolvedSetup,
  RunSetupOptions,
  RunSetupResult,
} from '@agentplugins/store';

// ─── definePlugin / defineConfig ─────────────────────────────────────────────

import type { PluginManifest } from '@agentplugins/contract';
import type { Plugin } from '@agentplugins/pipeline';

export type { Plugin } from '@agentplugins/pipeline';

export interface AgentPluginsConfig {
  /** The universal plugin manifest. */
  manifest: PluginManifest;
  /**
   * Pipeline plugins that contribute adapters, lint rules, emitters,
   * and lifecycle middleware. Registered before the builtin adapters so
   * they can override or extend any stage.
   */
  plugins?: Plugin[];
  /**
   * Override the target list for this build. Falls back to
   * `manifest.targets` and then to all built-in targets.
   */
  targets?: string[];
}

/** Identity helper — provides TypeScript inference for the manifest. */
export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}

/** Power-user config with plugins and target overrides. Backward-compatible. */
export function defineConfig(config: AgentPluginsConfig): AgentPluginsConfig {
  return config;
}
