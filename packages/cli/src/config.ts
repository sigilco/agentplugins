/**
 * AgentPlugins Config Loader
 *
 * Loads plugin configuration from agentplugins.config.ts/js/mjs/json files.
 * Uses jiti for TypeScript support without pre-compilation.
 *
 * Supports three export shapes:
 *   1. defineConfig({ manifest, plugins, targets }) — power user
 *   2. definePlugin(manifest) — bare manifest object
 *   3. () => PluginManifest — factory function
 */

import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import jiti from 'jiti';

// jiti's CJS default export is a function - cast to proper type
const createJITI = jiti as unknown as (filename: string, opts?: Record<string, unknown>) => {
  import: (id: string, opts?: Record<string, unknown>) => Promise<unknown>;
};
import type { PluginManifest, AgentPluginsConfig } from '@agentplugins/core';
import type { Plugin } from '@agentplugins/pipeline';

export interface LoadedConfig {
  /** Resolved manifest */
  manifest: PluginManifest;
  /** Root directory of the config file */
  root: string;
  /** Path to the config file */
  configPath: string;
  /** User-provided pipeline plugins from defineConfig (empty if bare manifest). */
  plugins: Plugin[];
  /** User-provided target override from defineConfig (undefined if not set). */
  configTargets?: string[];
}

function isDefineConfig(obj: unknown): obj is AgentPluginsConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'manifest' in obj &&
    typeof (obj as Record<string, unknown>).manifest === 'object'
  );
}

/**
 * Load configuration from a file path.
 * Supports .ts, .js, .mjs, .cjs, and .json config files.
 */
export async function loadConfig(configPath: string): Promise<LoadedConfig> {
  const resolvedPath = resolve(configPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const ext = extname(resolvedPath);
  let manifest: PluginManifest;
  let plugins: Plugin[] = [];
  let configTargets: string[] | undefined;

  if (ext === '.json') {
    // JSON config — always a bare manifest
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(resolvedPath, 'utf-8');
    manifest = JSON.parse(content) as PluginManifest;
  } else {
    // TypeScript/JavaScript config — use jiti
    const jitiLoader = createJITI(resolvedPath, {
      interopDefault: true,
      esmResolve: true,
    });

    const mod = await jitiLoader.import(resolvedPath, { default: true });
    const exported = (mod as Record<string, unknown>)?.default ?? mod;

    if (typeof exported === 'function') {
      manifest = await (exported as () => Promise<PluginManifest>)();
    } else if (isDefineConfig(exported)) {
      manifest = exported.manifest;
      plugins = exported.plugins ?? [];
      configTargets = exported.targets;
    } else {
      manifest = exported as PluginManifest;
    }
  }

  // Validate required fields
  if (!manifest.name) {
    throw new Error('Plugin manifest must have a "name" field');
  }
  if (!manifest.version) {
    throw new Error('Plugin manifest must have a "version" field');
  }
  if (!manifest.description) {
    throw new Error('Plugin manifest must have a "description" field');
  }

  const root = resolve(resolvedPath, '..');

  return { manifest, root, configPath: resolvedPath, plugins, configTargets };
}

/**
 * Find config file in the current directory.
 * Searches for: agentplugins.config.ts, .js, .mjs, .json
 */
export async function findConfig(cwd: string = process.cwd()): Promise<string | null> {
  const candidates = [
    'agentplugins.config.ts',
    'agentplugins.config.js',
    'agentplugins.config.mjs',
    'agentplugins.config.json',
  ];

  for (const name of candidates) {
    const fullPath = resolve(cwd, name);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}
