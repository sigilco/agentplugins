/**
 * Example custom adapter for a fictional "my-harness" platform.
 *
 * This shows the minimum surface a PlatformAdapter must implement.
 * Copy this file into your project and modify it for your target platform.
 */

import { Severity, type PlatformAdapter, type PluginManifest, type AdapterOutput } from '@agentplugins/core';

const MY_HARNESS_TARGET = 'my-harness' as const;

export const myHarnessAdapter: PlatformAdapter = {
  name: MY_HARNESS_TARGET,
  displayName: 'My Harness',
  supportedHooks: ['sessionStart', 'preToolUse', 'postToolUse'],
  supportedHandlers: ['command', 'inline'],
  manifestPath: 'my-harness.json',
  manifestFormat: 'json',

  validate(plugin: PluginManifest) {
    const issues = [];
    if (!plugin.name) {
      issues.push({ severity: Severity.ERROR, field: 'name', message: 'name is required' });
    }
    return issues;
  },

  compile(plugin: PluginManifest): AdapterOutput {
    const manifest = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      runtime: 'node',
    };

    return {
      files: [
        {
          path: 'my-harness.json',
          content: JSON.stringify(manifest, null, 2),
        },
        {
          path: 'index.js',
          content: `// ${plugin.name} v${plugin.version} — compiled by AgentPlugins\nexport const name = '${plugin.name}';\n`,
        },
      ],
      manifest,
      warnings: [],
      issues: [],
    };
  },
};
