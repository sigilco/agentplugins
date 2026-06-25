/**
 * Shared warning builders for the format ingestors.
 *
 * Every format maps fields differently and drops unsupported surfaces. The
 * helpers below keep the warning objects consistent across formats so callers
 * can filter by `code`, render them as a single table, or aggregate them into
 * a `--strict` exit code.
 */

import type { IngestWarning, WarningSeverity } from './types.js';

export function warn(
  code: string,
  severity: WarningSeverity,
  message: string,
  extras: Partial<Omit<IngestWarning, 'code' | 'severity' | 'message'>> = {}
): IngestWarning {
  return { code, severity, message, ...extras };
}

/** A field is present in the upstream manifest but has no AgentPlugins v1
 *  equivalent. It is preserved in `metadata._dropped` so the user can recover
 *  it later if v2 adds support. */
export function droppedField(
  sourcePath: string,
  field: string,
  upstreamValue: unknown
): IngestWarning {
  return warn(
    'dropped-field',
    'warning',
    `Field "${field}" is not representable in AgentPlugins v1 — preserved in metadata._dropped.`,
    {
      sourcePath,
      field,
      suggestion: `Inspect metadata._dropped["${field}"] to recover the upstream value: ${summarize(upstreamValue)}`,
    }
  );
}

/** A hook return-value contract exists in the upstream format but is not
 *  expressible in AgentPlugins v1. The handler is preserved but its return
 *  value will be discarded at runtime. */
export function unsupportedHookReturn(hookName: string, sourcePath?: string): IngestWarning {
  return warn(
    'unsupported-hook-return',
    'warning',
    `Hook "${hookName}" can return values to block/mutate in its native harness; AgentPlugins v1 handlers are fire-and-forget. The return value will be discarded.`,
    {
      sourcePath,
      field: `hooks.${hookName}`,
      suggestion: 'If you depend on this hook for blocking, use the Claude adapter directly instead of going through AgentPlugins.',
    }
  );
}

/** A dependency declared in the upstream manifest has been silently dropped or
 *  inferred from a field the ingestor does not model. */
export function droppedDependency(name: string, sourcePath?: string): IngestWarning {
  return warn(
    'dropped-dependency',
    'warning',
    `Upstream dependency "${name}" has no direct AgentPlugins v1 representation.`,
    {
      sourcePath,
      suggestion: 'Re-declare in `dependencies` once the plugin is converted.',
    }
  );
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 80));
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return '[unserializable]';
  }
}
