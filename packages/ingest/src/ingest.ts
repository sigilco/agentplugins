/**
 * Single dispatch entry point for format ingestors.
 *
 * Throws on unknown format names. Per-format functions are also exported
 * directly when the format is already known.
 */

import { ingestClaudeCode } from './claude-code.js';
import { ingestCodex } from './codex.js';
import { ingestSkillsSh } from './skills-sh.js';
import type { IngestFormat, IngestResult } from './types.js';

export function ingest(format: IngestFormat, sourceRoot: string): IngestResult {
  switch (format) {
    case 'claude-code':
      return ingestClaudeCode(sourceRoot);
    case 'codex':
      return ingestCodex(sourceRoot);
    case 'skills-sh':
      return ingestSkillsSh(sourceRoot);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown ingest format: ${String(_exhaustive)}`);
    }
  }
}
