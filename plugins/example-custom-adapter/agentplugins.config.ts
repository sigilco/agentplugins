/**
 * Example: plugin with a custom adapter for a private harness.
 *
 * Uses defineConfig instead of definePlugin to wire in the custom adapter
 * without publishing to npm. The adapter lives next to this config file.
 *
 * Run: agentplugins build
 * Output: dist/claude/ and dist/my-harness/
 */

import { defineConfig } from '@agentplugins/core';
import { myHarnessAdapter } from './src/my-harness-adapter.js';

export default defineConfig({
  manifest: {
    name: 'my-custom-plugin',
    version: '0.1.0',
    description: 'Plugin demonstrating a private custom adapter alongside built-in targets',

    hooks: {
      sessionStart: {
        handler: {
          type: 'command',
          command: 'echo "Session started"',
        },
      },
    },
  },

  plugins: [
    {
      name: 'my-harness-adapter',
      adapter: myHarnessAdapter,
    },
  ],

  // Build for Claude (built-in) + my-harness (custom adapter above)
  targets: ['claude', 'my-harness'],
});
