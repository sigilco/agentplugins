/**
 * AgentPlugins Format Ingestor
 *
 * Imports community plugins from Claude Code, Codex, and Skills.sh into
 * AgentPlugins v1 manifests. Each format emits a structured {@link IngestResult}
 * with the translated manifest plus warnings about dropped fields, lossy
 * conversions, and unsupported hook return-value contracts.
 *
 * Use {@link ingest} as the single entrypoint; it dispatches on the format name
 * and throws if the format is unknown. Use the per-format exports when you need
 * to assert the format explicitly.
 */

export { ingest } from './ingest.js';
export { ingestClaudeCode } from './claude-code.js';
export { ingestCodex } from './codex.js';
export { ingestSkillsSh } from './skills-sh.js';

export type {
  IngestFormat,
  IngestWarning,
  WarningSeverity,
  IngestResult,
  VendorFile,
} from './types.js';
