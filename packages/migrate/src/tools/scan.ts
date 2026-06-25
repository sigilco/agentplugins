/**
 * scan: list which AgentPlugins ingest formats recognize a source directory.
 *
 * Heuristic: probe for the manifest files each format expects. Returns a list
 * of {format, recognized, manifestPath?} entries so the agent can pick a format
 * or call `convert` directly with a known one.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool, z } from './_helpers.js';

const PROBES: Array<{ format: 'claude-code' | 'codex' | 'skills-sh'; detect: (root: string) => string | null }> = [
  {
    format: 'claude-code',
    detect: (root) => {
      const p = join(root, '.claude-plugin', 'plugin.json');
      return existsSync(p) ? p : null;
    },
  },
  {
    format: 'codex',
    detect: (root) => {
      const p = join(root, '.codex-plugin', 'plugin.json');
      return existsSync(p) ? p : null;
    },
  },
  {
    format: 'skills-sh',
    detect: (root) => {
      try {
        const st = statSync(join(root, 'SKILL.md'));
        if (st.isFile()) return 'SKILL.md';
      } catch { /* ignore */ }
      try {
        const st = statSync(join(root, 'skill.md'));
        if (st.isFile()) return 'skill.md';
      } catch { /* ignore */ }
      return null;
    },
  },
];

export const scanTool = defineTool(
  {
    source: z.string().describe('Absolute path to the source directory to scan'),
  },
  async ({ source }) => {
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Not a directory: ${source}` }, null, 2) }],
        isError: true,
      };
    }
    const results = PROBES.map((probe) => {
      const manifestPath = probe.detect(source);
      return {
        format: probe.format,
        recognized: manifestPath !== null,
        manifestPath,
      };
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ source, formats: results }, null, 2) }],
    };
  }
);
