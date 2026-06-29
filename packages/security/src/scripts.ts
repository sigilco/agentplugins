/**
 * Lifecycle script policy.
 *
 * The single biggest supply-chain risk for plugin managers is `npm install`'s
 * lifecycle scripts (`preinstall`, `install`, `postinstall`). AgentPlugins v1
 * follows a **default-deny** posture:
 *
 *   - Plugins declare their lifecycle script requirements via
 *     `manifest.dependencies[*].lifecycle` (or via the older `scripts` field on
 *     the manifest itself, if present).
 *   - The install step calls {@link evaluateScriptPolicy} for every declared
 *     script. Anything not on the explicit allow-list is refused unless the
 *     caller passes `--allow-unsafe-scripts`.
 *   - High-risk script categories (`curl | sh`, `wget | sh`, `npx ...`) are
 *     never auto-allowed.
 *
 * The policy is data-driven so the audit command, the MCP server, and the
 * install CLI all reason about the same rules.
 */

export interface ScriptContext {
  /** Name of the dependency the script belongs to (e.g. `left-pad`). */
  dependency: string;
  /** Lifecycle phase: `preinstall`, `install`, `postinstall`, `prepare`. */
  phase: 'preinstall' | 'install' | 'postinstall' | 'prepare' | 'prepublish' | 'postpublish';
  /** The actual command that would be executed. */
  command: string;
  /** Source plugin name (for logging). */
  pluginName?: string;
}

export type ScriptDecision = 'allow' | 'deny' | 'require-review';

export interface ScriptPolicy {
  /** Phases that are allowed by default (e.g. an empty list = deny all). */
  defaultAllow: ScriptContext['phase'][];
  /** Command patterns that are ALWAYS denied regardless of phase. */
  hardDenylist: RegExp[];
  /** Command patterns that are allowed without review if the phase is allowed. */
  softAllowlist: RegExp[];
}

export const DEFAULT_POLICY: ScriptPolicy = {
  defaultAllow: [], // default-deny
  hardDenylist: [
    /\bcurl\b[^|]*\|\s*(?:sudo\s+)?(?:ba)?sh/i,   // curl | sh
    /\bwget\b[^|]*\|\s*(?:sudo\s+)?(?:ba)?sh/i,   // wget | sh
    /\bnpx\b\s+--yes\b/i,                          // npx --yes (silent install)
    /\brm\s+-rf?\s+\/(?:\s|$)/,                    // rm -rf /
    /\bchmod\s+777\b/i,                            // chmod 777
    /\beval\s*\(/i,                                // eval(...)
    /\bbase64\s+-d\b[^|]*\|\s*(?:ba)?sh/i,         // base64 -d | sh
  ],
  softAllowlist: [
    /^node\s+-[a-z]+\s+[\w./-]+\.js(?:\s|$)/,     // node <script>.js
    /^node\s+[\w./-]+\.js(?:\s|$)/,
    /^npx\s+tsc(?:\s|$)/,                          // npx tsc
    /^npm\s+run\s+build(?:\s|$)/,                  // npm run build
  ],
};

/**
 * Evaluate a single lifecycle script and return the decision.
 *
 * Order of evaluation:
 *   1. Hard denylist — anything matching is `deny`, no override possible.
 *   2. Phase allow-list — `require-review` if the phase isn't in `defaultAllow`.
 *   3. Soft allowlist — `allow` if the command matches.
 *   4. Default — `require-review`.
 */
export function evaluateScriptPolicy(ctx: ScriptContext, policy: ScriptPolicy = DEFAULT_POLICY): {
  decision: ScriptDecision;
  reasons: string[];
} {
  const reasons: string[] = [];

  for (const pattern of policy.hardDenylist) {
    if (pattern.test(ctx.command)) {
      return { decision: 'deny', reasons: [`Command matches hard denylist pattern: ${pattern.source}`] };
    }
  }

  if (!policy.defaultAllow.includes(ctx.phase)) {
    reasons.push(`Phase "${ctx.phase}" is not in the default allow-list (default-deny posture)`);
  }

  const matchesSoftAllow = policy.softAllowlist.some((p) => p.test(ctx.command));
  if (matchesSoftAllow) {
    if (reasons.length === 0) return { decision: 'allow', reasons: ['Command matches soft allow-list'] };
    return { decision: 'require-review', reasons };
  }

  if (reasons.length === 0) {
    reasons.push('Command does not match the soft allow-list');
  } else {
    reasons.push('Command does not match the soft allow-list either');
  }

  return { decision: 'require-review', reasons };
}

// ─── Manifest-wide script evaluation ──────────────────────────────────────────

export interface ManifestScriptIssue {
  dependency: string;
  phase: ScriptContext['phase'];
  command: string;
  decision: ScriptDecision;
  reasons: string[];
}

/**
 * Evaluate all lifecycle scripts declared in a manifest.
 * Checks both top-level `scripts` and `dependencies[*].lifecycle`.
 * Returns `{ ok: false }` if any script is not explicitly allowed.
 */
export function evaluateManifestScripts(
  manifest: Record<string, unknown>,
  pluginName?: string,
  policy: ScriptPolicy = DEFAULT_POLICY,
): { ok: boolean; issues: ManifestScriptIssue[] } {
  const issues: ManifestScriptIssue[] = [];

  // 1. Top-level manifest.scripts: { [phase]: command }
  const scripts = manifest.scripts;
  if (scripts && typeof scripts === 'object') {
    for (const [phase, command] of Object.entries(scripts)) {
      if (typeof command !== 'string' || command.length === 0) continue;
      const ctx: ScriptContext = { dependency: pluginName ?? 'plugin', phase: phase as ScriptContext['phase'], command, pluginName };
      const { decision, reasons } = evaluateScriptPolicy(ctx, policy);
      if (decision !== 'allow') issues.push({ ...ctx, decision, reasons });
    }
  }

  // 2. manifest.dependencies[*].lifecycle: { [phase]: command }
  const deps = manifest.dependencies;
  if (Array.isArray(deps)) {
    for (const dep of deps) {
      if (!dep || typeof dep !== 'object') continue;
      const depName = (dep as any).name ?? 'unknown-dependency';
      const lifecycle = (dep as any).lifecycle;
      if (lifecycle && typeof lifecycle === 'object') {
        for (const [phase, command] of Object.entries(lifecycle)) {
          if (typeof command !== 'string' || command.length === 0) continue;
          const ctx: ScriptContext = { dependency: depName, phase: phase as ScriptContext['phase'], command, pluginName };
          const { decision, reasons } = evaluateScriptPolicy(ctx, policy);
          if (decision !== 'allow') issues.push({ ...ctx, decision, reasons });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
