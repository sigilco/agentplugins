/**
 * Shared types for the format ingestors.
 */

export type IngestFormat = 'claude-code' | 'codex' | 'skills-sh';

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface IngestWarning {
  /** Stable identifier — useful for tests and `--quiet` filters. */
  code: string;
  severity: WarningSeverity;
  /** Human-readable explanation; safe to print verbatim. */
  message: string;
  /** Path of the upstream source file that triggered the warning, if any. */
  sourcePath?: string;
  /** Manifest field that the warning applies to, dotted-path. */
  field?: string;
  /** Suggested remediation when one is obvious. */
  suggestion?: string;
}

/** A file from the upstream source tree that should be copied into the
 *  generated AgentPlugins plugin so the upstream code still runs. */
export interface VendorFile {
  /** Absolute path on disk to the source file. */
  absolutePath: string;
  /** Path relative to the source root — used as the destination path. */
  relativePath: string;
  /** Why this file needs vendoring (e.g. "upstream hooks/handlers/*.ts"). */
  reason: string;
}

export interface IngestResult {
  /** The AgentPlugins v1 manifest (not yet validated against the JSON Schema). */
  manifest: Record<string, unknown>;
  /** Structured warnings — never throw, always collect. */
  warnings: IngestWarning[];
  /** Files that must be copied into the plugin directory at install time. */
  vendorFiles: VendorFile[];
  /** Which format produced this result. */
  format: IngestFormat;
  /** Absolute path of the source root that was ingested. */
  sourceRoot: string;
}
