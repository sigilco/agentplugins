import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Middleware, BuildCtx } from '@agentplugins/pipeline';
import { validateUniversal } from './validation.js';
import { lint } from './lint.js';
import type { LintRule } from './lint.js';
import { sanitizeJoin } from './sanitize.js';

// ─── validateMiddleware ───────────────────────────────────────────────────────

export interface ValidateOptions {
  /** If true, abort on validation errors. Defaults to true. */
  abortOnError?: boolean;
}

export function validateMiddleware(options: ValidateOptions = {}): Middleware<BuildCtx> {
  const { abortOnError = true } = options;

  return async (ctx, next) => {
    const issues = validateUniversal(ctx.manifest);
    for (const issue of issues) ctx.addIssue(issue);

    if (abortOnError && issues.some(i => i.severity === 'error')) {
      ctx.abort('Universal validation failed. Fix errors before building.');
    }

    await next();
  };
}

// ─── lintMiddleware ───────────────────────────────────────────────────────────

export interface LintOptions {
  /** Extra lint rules in addition to the global registry. */
  extraRules?: LintRule[];
  /** If true and in strict mode, abort on lint errors. */
  strict?: boolean;
}

export function lintMiddleware(options: LintOptions = {}): Middleware<BuildCtx> {
  const { extraRules = [], strict = false } = options;

  return async (ctx, next) => {
    const inlineSources = await collectInlineSources(ctx);
    const issues = lint({ manifest: ctx.manifest, inlineHandlerSource: inlineSources, extraRules });

    for (const issue of issues) {
      ctx.addWarning(`[lint:${issue.rule}] ${issue.message}`);
    }

    if (strict && issues.some(i => i.severity === 'error')) {
      ctx.abort(`Strict mode: ${issues.filter(i => i.severity === 'error').length} lint error(s) found.`);
    }

    await next();
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function collectInlineSources(ctx: BuildCtx): Promise<string[]> {
  const sources: string[] = [];
  if (!ctx.manifest.hooks) return sources;
  for (const def of Object.values(ctx.manifest.hooks)) {
    if (!def) continue;
    const handler = def.handler as { type: string; code?: string; source?: string };
    if (handler.type === 'inline') {
      if (handler.code) {
        sources.push(handler.code);
      } else if (handler.source && ctx.pluginRoot) {
        try {
          const content = await readFile(sanitizeJoin(resolve(ctx.pluginRoot), handler.source), 'utf-8');
          sources.push(content);
        } catch {
          // skip unreadable sources
        }
      }
    }
  }
  return sources;
}
