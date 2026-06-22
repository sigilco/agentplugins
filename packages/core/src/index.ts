/**
 * AgentPlugins Core
 *
 * The Port — universal plugin interface for AI agent harnesses.
 */

// Types — plugin author surface
export type {
  PluginManifest,
  TargetPlatform,
  Skill,
  MCPServerConfig,
  ToolDefinition,
  ToolParameter,
  ToolContext,
  ToolResult,
  UserConfigOption,
  UniversalHooks,
  HookHandler,
  CommandHookHandler,
  HttpHookHandler,
  InlineHookHandler,
  HookContext,
  HookResult,
} from './types.js';

export { Severity } from './types.js';

// Import PluginManifest for the definePlugin function (value-level usage)
import type { PluginManifest } from './types.js';

// Constants
export { ALL_TARGETS, UNIVERSAL_HOOK_NAMES } from './types.js';

// Validation — plugin CI
export { validateUniversal, validateForPlatform } from './validation.js';

// Lint — plugin CI
export { lint, lintManifest } from './lint.js';
export type { LintIssue, LintRule } from './lint.js';

// Store — re-exported for CLI use (internal only)
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
  getSymlinks,
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

/**
 * Convenience function to define a plugin with TypeScript intellisense.
 */
export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}
