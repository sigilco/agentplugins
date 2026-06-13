/**
 * AgentPlugins Adapter Registry
 *
 * Central registry for all platform adapters.
 * Adapters register themselves; the CLI and build system look them up here.
 */

import type { PlatformAdapter, TargetPlatform } from './types.js';

const adapterMap = new Map<TargetPlatform, () => Promise<PlatformAdapter>>();

/**
 * Register a platform adapter factory.
 * Called by each adapter package during initialization.
 */
export function registerAdapter(
  platform: TargetPlatform,
  factory: () => Promise<PlatformAdapter>
): void {
  adapterMap.set(platform, factory);
}

/**
 * Check if an adapter is registered for a platform.
 */
export function hasAdapter(platform: TargetPlatform): boolean {
  return adapterMap.has(platform);
}

/**
 * Load a platform adapter asynchronously.
 */
export async function loadAdapter(platform: TargetPlatform): Promise<PlatformAdapter> {
  const factory = adapterMap.get(platform);
  if (!factory) {
    throw new Error(
      `No adapter registered for platform "${platform}". ` +
      `Install the corresponding adapter package: npm install @agentplugins/adapter-${platform}`
    );
  }
  return factory();
}

/**
 * Load all registered adapters.
 */
export async function loadAllAdapters(): Promise<Map<TargetPlatform, PlatformAdapter>> {
  const result = new Map<TargetPlatform, PlatformAdapter>();
  for (const [platform, factory] of adapterMap) {
    result.set(platform, await factory());
  }
  return result;
}

/**
 * Get list of registered platforms.
 */
export function getRegisteredPlatforms(): TargetPlatform[] {
  return Array.from(adapterMap.keys());
}

/**
 * Import and register all built-in adapters.
 * This is a convenience function that auto-registers all official adapters.
 */
export async function registerBuiltinAdapters(): Promise<void> {
  // Dynamic imports to avoid loading adapters that aren't installed
  const builtinAdapters: { platform: TargetPlatform; pkg: string }[] = [
    { platform: 'claude', pkg: '@agentplugins/adapter-claude' },
    { platform: 'codex', pkg: '@agentplugins/adapter-codex' },
    { platform: 'copilot', pkg: '@agentplugins/adapter-copilot' },
    { platform: 'gemini', pkg: '@agentplugins/adapter-gemini' },
    { platform: 'kimi', pkg: '@agentplugins/adapter-kimi' },
    { platform: 'opencode', pkg: '@agentplugins/adapter-opencode' },
    { platform: 'pimono', pkg: '@agentplugins/adapter-pimono' },
  ];

  for (const { platform, pkg } of builtinAdapters) {
    try {
      // Use dynamic import that works in both ESM and bundled contexts
      const mod = await import(/* @vite-ignore */ pkg);
      if (mod.createAdapter) {
        registerAdapter(platform, mod.createAdapter);
      }
    } catch {
      // Adapter package not installed — that's fine, skip it
    }
  }
}
