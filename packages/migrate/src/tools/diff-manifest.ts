/**
 * diff_manifest: compare two manifests field-by-field.
 *
 * Used by agents to surface what the ingestor changed before approving the
 * result. The diff is shallow (top-level keys + primitive comparison); nested
 * objects/arrays are reported as "changed" without deep structural diffing.
 */

import { defineTool, z } from './_helpers.js';

export const diffManifestTool = defineTool(
  {
    before: z.record(z.unknown()).describe('The original manifest (or any baseline)'),
    after: z.record(z.unknown()).describe('The generated manifest'),
  },
  async ({ before, after }) => {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ field: string; before: unknown; after: unknown }> = [];
    for (const k of keys) {
      const inBefore = k in before;
      const inAfter = k in after;
      if (inBefore && !inAfter) removed.push(k);
      else if (!inBefore && inAfter) added.push(k);
      else if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        changed.push({ field: k, before: before[k], after: after[k] });
      }
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ added, removed, changed }, null, 2) }],
    };
  }
);
