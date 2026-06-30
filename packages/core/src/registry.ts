/**
 * AgentPlugins Adapter Registry
 *
 * Backed by the pipeline App. Each registered adapter becomes a Plugin
 * on the shared App instance, fixing the stale `createAdapter`-only bug
 * in the previous implementation.
 */

import { createApp } from '@agentplugins/pipeline';
import type { App } from '@agentplugins/pipeline';
import type { PlatformAdapter, TargetPlatform } from './types.js';

const _app = createApp();

const _asyncFactories = new Map<TargetPlatform, () => Promise<PlatformAdapter>>();

/** Access the shared pipeline App that backs this registry. */
export function getRegistryApp(): App {
  return _app;
}

const BUILTIN_ADAPTER_SPECS: Array<{ platform: TargetPlatform; pkg: string; exportName: string }> = [
  { platform: 'claude',   pkg: '@agentplugins/adapter-claude',   exportName: 'createClaudeAdapter' },
  { platform: 'codex',    pkg: '@agentplugins/adapter-codex',    exportName: 'createCodexAdapter' },
  { platform: 'copilot',  pkg: '@agentplugins/adapter-copilot',  exportName: 'createCopilotAdapter' },
  { platform: 'gemini',   pkg: '@agentplugins/adapter-gemini',   exportName: 'createGeminiAdapter' },
  { platform: 'kimi',     pkg: '@agentplugins/adapter-kimi',     exportName: 'createKimiAdapter' },
  { platform: 'opencode', pkg: '@agentplugins/adapter-opencode', exportName: 'createOpenCodeAdapter' },
  { platform: 'pimono',   pkg: '@agentplugins/adapter-pimono',   exportName: 'createPiMonoAdapter' },
];

/**
 * Register a platform adapter factory.
 * The factory is called immediately and the adapter is registered synchronously.
 */
export function registerAdapter(
  platform: TargetPlatform,
  factory: () => Promise<PlatformAdapter>
): void {
  _asyncFactories.set(platform, factory);
  factory()
    .then(adapter => _app.use({ name: platform, adapter }))
    .catch(() => {
      // adapter init failed — do not register
    });
}

export function hasAdapter(platform: TargetPlatform): boolean {
  return _app.adapters.has(platform) || _asyncFactories.has(platform);
}

export async function loadAdapter(platform: TargetPlatform): Promise<PlatformAdapter> {
  const adapter = _app.adapters.get(platform);
  if (adapter) return adapter;

  const factory = _asyncFactories.get(platform);
  if (factory) {
    const resolved = await factory();
    _app.use({ name: platform, adapter: resolved });
    return resolved;
  }

  throw new Error(
    `No adapter registered for platform "${platform}". ` +
    `Install the corresponding adapter package: npm install @agentplugins/adapter-${platform}`
  );
}

export async function loadAllAdapters(): Promise<Map<TargetPlatform, PlatformAdapter>> {
  for (const [platform, factory] of _asyncFactories) {
    if (!_app.adapters.has(platform)) {
      try {
        const adapter = await factory();
        _app.use({ name: platform, adapter });
      } catch {
        // skip failed adapters
      }
    }
  }
  return new Map(_app.adapters) as Map<TargetPlatform, PlatformAdapter>;
}

export function getRegisteredPlatforms(): TargetPlatform[] {
  return Array.from(_app.adapters.keys()) as TargetPlatform[];
}

export async function registerBuiltinAdapters(): Promise<void> {
  for (const { platform, pkg, exportName } of BUILTIN_ADAPTER_SPECS) {
    try {
      // @ts-ignore — dynamic import; package may not be installed
      const mod = await import(pkg);
      const factory = mod[exportName] as (() => PlatformAdapter) | undefined;
      if (typeof factory === 'function') {
        _app.use({ name: platform, adapter: factory() });
      }
    } catch {
      // Adapter package not installed — skip silently
    }
  }
}
