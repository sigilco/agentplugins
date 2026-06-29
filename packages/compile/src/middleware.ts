import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { PlatformAdapter } from '@agentplugins/contract';
import type { Middleware, BuildCtx, TargetCtx } from '@agentplugins/pipeline';
import { validateUniversal, validateForPlatform } from './validation.js';
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

// ─── compileMiddleware ────────────────────────────────────────────────────────

export interface CompileMiddlewareOptions {
  adapters: ReadonlyMap<string, PlatformAdapter>;
  /** If true, skip targets with platform validation errors. Defaults to true. */
  skipOnPlatformError?: boolean;
}

export function compileMiddleware(options: CompileMiddlewareOptions): Middleware<BuildCtx> {
  const { adapters, skipOnPlatformError = true } = options;

  return async (ctx, next) => {
    for (const target of ctx.targets) {
      const adapter = adapters.get(target);
      if (!adapter) {
        ctx.addWarning(`No adapter registered for target "${target}" — skipping.`);
        continue;
      }

      const platformIssues = validateForPlatform(ctx.manifest, target as never);
      const platformErrors = platformIssues.filter(i => i.severity === 'error');

      if (skipOnPlatformError && platformErrors.length > 0) {
        ctx.addWarning(
          `Build failed for ${target}: ${platformErrors.length} validation error(s) — ${platformErrors.map(e => e.message).join('; ')}`
        );
        continue;
      }

      try {
        const output = adapter.compile(ctx.manifest, { pluginRoot: ctx.pluginRoot });

        for (const file of output.files) {
          ctx.addFile(target, file);
        }
        for (const w of output.warnings) {
          ctx.addWarning(`[${target}] ${w}`);
        }
        if (output.nativeCopies) {
          for (const copy of output.nativeCopies) {
            ctx.addNativeCopy(target, copy);
          }
        }
        if (output.postInstall) {
          for (const step of output.postInstall) {
            ctx.addPostInstall(target, step);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.addWarning(`Build failed for ${target}: ${msg}`);
      }
    }

    await next();
  };
}

// ─── writeMiddleware ──────────────────────────────────────────────────────────

export function writeMiddleware(): Middleware<BuildCtx> {
  return async (ctx, next) => {
    await next();

    if (!ctx.outDir) return;

    const resolvedOut = resolve(ctx.outDir);

    for (const [target, files] of ctx.files) {
      const targetDir = join(resolvedOut, target);
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(targetDir, { recursive: true });

      for (const file of files) {
        const filePath = join(targetDir, file.path);
        await mkdir(resolve(filePath, '..'), { recursive: true });
        await writeFile(filePath, file.content, 'utf-8');
      }

      const nativeCopies = ctx.nativeCopies.get(target) ?? [];
      if (nativeCopies.length > 0 && ctx.pluginRoot) {
        const resolvedRoot = resolve(ctx.pluginRoot);
        for (const copy of nativeCopies) {
          const srcPath = sanitizeJoin(resolvedRoot, copy.from);
          const dstPath = sanitizeJoin(targetDir, copy.to);
          await mkdir(resolve(dstPath, '..'), { recursive: true });
          const content = await readFile(srcPath, 'utf-8');
          await writeFile(dstPath, content, 'utf-8');
        }
      }
    }
  };
}

// ─── targetWriteMiddleware ────────────────────────────────────────────────────

export function targetWriteMiddleware(outDir: string): Middleware<TargetCtx> {
  return async (ctx, next) => {
    await next();

    const resolvedOut = resolve(outDir);
    const targetDir = join(resolvedOut, ctx.target);
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });

    for (const file of ctx.files) {
      const filePath = join(targetDir, file.path);
      await mkdir(resolve(filePath, '..'), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }

    if (ctx.nativeCopies.length > 0 && ctx.pluginRoot) {
      const resolvedRoot = resolve(ctx.pluginRoot);
      for (const copy of ctx.nativeCopies) {
        const srcPath = sanitizeJoin(resolvedRoot, copy.from);
        const dstPath = sanitizeJoin(targetDir, copy.to);
        await mkdir(resolve(dstPath, '..'), { recursive: true });
        const content = await readFile(srcPath, 'utf-8');
        await writeFile(dstPath, content, 'utf-8');
      }
    }
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
