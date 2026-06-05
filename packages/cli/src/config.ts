/**
 * AgentBridge Config Loader
 *
 * Loads plugin configuration from agentbridge.config.ts/js/mjs/json files.
 * Uses jiti for TypeScript support without pre-compilation.
 */

import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import jiti from 'jiti';

// jiti's CJS default export is a function - cast to proper type
const createJITI = jiti as unknown as (filename: string, opts?: Record<string, unknown>) => {
  import: (id: string, opts?: Record<string, unknown>) => Promise<unknown>;
};
import type { PluginManifest } from '@agentbridge/core';

export interface LoadedConfig {
  /** Resolved manifest */
  manifest: PluginManifest;
  /** Root directory of the config file */
  root: string;
  /** Path to the config file */
  configPath: string;
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

  if (ext === '.json') {
    // JSON config
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(resolvedPath, 'utf-8');
    manifest = JSON.parse(content) as PluginManifest;
  } else {
    // TypeScript/JavaScript config — use jiti
    const jiti = createJITI(resolvedPath, {
      interopDefault: true,
      esmResolve: true,
    });

    const mod = await jiti.import(resolvedPath, { default: true });
    const exported = (mod as any)?.default ?? mod;

    if (typeof exported === 'function') {
      manifest = await exported();
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

  // Resolve root directory
  const root = resolve(resolvedPath, '..');

  return { manifest, root, configPath: resolvedPath };
}

/**
 * Find config file in the current directory.
 * Searches for: agentbridge.config.ts, .js, .mjs, .json
 */
export async function findConfig(cwd: string = process.cwd()): Promise<string | null> {
  const candidates = [
    'agentbridge.config.ts',
    'agentbridge.config.js',
    'agentbridge.config.mjs',
    'agentbridge.config.json',
  ];

  for (const name of candidates) {
    const fullPath = resolve(cwd, name);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}
