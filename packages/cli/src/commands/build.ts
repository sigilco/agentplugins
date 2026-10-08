/**
 * AgentPlugins Build Command
 *
 * Compiles a universal plugin into platform-specific packages.
 */

import { resolve, join } from 'node:path';
import { rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
  UNIVERSAL_HOOK_NAMES,
  type TargetPlatform,
  type PluginManifest,
  type PlatformAdapter,
  type CompileOptions as AdapterCompileOptions,
} from '@agentplugins/core';
import { sanitizeJoin, lint, registerEmitter, type LintIssue } from '@agentplugins/compile';
import { createApp, createBuildCtx, createTargetCtx } from '@agentplugins/pipeline';
import { getCliLogger } from '../logger.js';
import type { App, Plugin } from '@agentplugins/pipeline';
import type { LoadedConfig } from '../config.js';

const logger = getCliLogger();

// ─── Target resolution ────────────────────────────────────────────────────────

function resolveTargets(
  cliTargets: string[] | undefined,
  manifestTargets: string[] | undefined
): TargetPlatform[] {
  return (cliTargets ?? manifestTargets ?? ALL_TARGETS) as TargetPlatform[];
}

// ─── Builtin adapter app ──────────────────────────────────────────────────────

interface AdapterSpec {
  platform: TargetPlatform;
  pkg: string;
  exportName: string;
}

const BUILTIN_ADAPTER_SPECS: AdapterSpec[] = [
  { platform: 'claude',    pkg: '@agentplugins/adapter-claude',    exportName: 'createClaudeAdapter' },
  { platform: 'codex',     pkg: '@agentplugins/adapter-codex',     exportName: 'createCodexAdapter' },
  { platform: 'copilot',   pkg: '@agentplugins/adapter-copilot',   exportName: 'createCopilotAdapter' },
  { platform: 'gemini',    pkg: '@agentplugins/adapter-gemini',    exportName: 'createGeminiAdapter' },
  { platform: 'kimi',      pkg: '@agentplugins/adapter-kimi',      exportName: 'createKimiAdapter' },
  { platform: 'opencode',  pkg: '@agentplugins/adapter-opencode',  exportName: 'createOpenCodeAdapter' },
  { platform: 'pimono',    pkg: '@agentplugins/adapter-pimono',    exportName: 'createPiMonoAdapter' },
];

// scriptc: import() only accepts literal specifiers (the module graph embeds at
// build time), so each builtin adapter resolves through an explicit arm.
async function importAdapterFactory(pkg: string): Promise<any> {
  switch (pkg) {
    case '@agentplugins/adapter-claude':   return (await import('@agentplugins/adapter-claude')).createClaudeAdapter;
    case '@agentplugins/adapter-codex':    return (await import('@agentplugins/adapter-codex')).createCodexAdapter;
    case '@agentplugins/adapter-copilot':  return (await import('@agentplugins/adapter-copilot')).createCopilotAdapter;
    case '@agentplugins/adapter-gemini':   return (await import('@agentplugins/adapter-gemini')).createGeminiAdapter;
    case '@agentplugins/adapter-kimi':     return (await import('@agentplugins/adapter-kimi')).createKimiAdapter;
    case '@agentplugins/adapter-opencode': return (await import('@agentplugins/adapter-opencode')).createOpenCodeAdapter;
    case '@agentplugins/adapter-pimono':   return (await import('@agentplugins/adapter-pimono')).createPiMonoAdapter;
    default: return undefined;
  }
}

async function buildApp(userPlugins: Plugin[] = []): Promise<App> {
  const app = createApp();

  // Register builtin adapters first (lower precedence)
  for (const { platform, pkg } of BUILTIN_ADAPTER_SPECS) {
    try {
      const factory = await importAdapterFactory(pkg);
      if (typeof factory === 'function') {
        app.use({ name: platform, adapter: factory() });
      }
    } catch {
      // Adapter package not installed — skip silently
    }
  }

  // Register user plugins after builtins so they can override any builtin
  for (const plugin of userPlugins) {
    app.use(plugin);
  }

  // Register custom code emitters into the global codegen registry
  for (const [, emitter] of app.emitters) {
    // scriptc: `as any` casts of dynamic-package values are checked casts — bind
    // through an any-typed local instead (also bridges pipeline/compile CodeEmitter).
    const e: any = emitter;
    registerEmitter(e);
  }

  return app;
}

// ─── Compile (extracted for reuse by preview) ──────────────────────────────

export interface CompileFile {
  path: string;
  content: string;
}

export interface CompileResult {
  target: TargetPlatform;
  files: CompileFile[];
  warnings: string[];
  postInstall?: string[];
  skipped: boolean;
  error?: string;
}

export interface CompileOptions {
  manifest: PluginManifest;
  targets?: TargetPlatform[];
  write?: boolean;
  outDir?: string;
  silent?: boolean;
  /** Plugin root directory — required to resolve nativeEntry source paths. */
  pluginRoot?: string;
  /** User-provided pipeline plugins from defineConfig. */
  plugins?: Plugin[];
  /** Pre-built app; skips buildApp() when provided (used by build() to avoid double-init). */
  _app?: App;
}

/**
 * Run the compilation pipeline for one or more targets.
 * If `write` is true, files are written to `outDir/<target>/`.
 * Returns per-target results.
 */
export async function compile(options: CompileOptions): Promise<CompileResult[]> {
  const { write = false, outDir, silent = false, pluginRoot, plugins = [] } = options;
  const app = options._app ?? await buildApp(plugins);

  // Run preValidate + transformIR lifecycle hooks; use possibly mutated manifest
  const buildCtx = createBuildCtx({
    manifest: options.manifest,
    targets: (resolveTargets(options.targets, options.manifest.targets) as string[]),
    outDir,
    pluginRoot,
  });
  await app.runBuild(buildCtx);
  const manifest = buildCtx.manifest;

  const targetList = resolveTargets(options.targets, manifest.targets);
  const results: CompileResult[] = [];

  for (const target of targetList) {
    // scriptc: ReadonlyMap.get has no lowering — look the adapter up by iteration.
    let adapter: PlatformAdapter | undefined;
    for (const [p, a] of app.adapters) {
      if (p === target) { adapter = a; break; }
    }
    if (!adapter) {
      results.push({ target, files: [], warnings: [], skipped: true });
      continue;
    }

    if (!silent) logger.info('\n📦 Building for {target}...', { target });

    const platformIssues = validateForPlatform(manifest, target);
    const platformErrors = platformIssues.filter(i => i.severity === 'error');
    if (platformErrors.length > 0) {
      const msg = `${platformErrors.length} validation error${platformErrors.length > 1 ? 's' : ''}`;
      if (!silent) logger.error('   ✗ Build failed for {target} ({msg})', { target, msg });
      results.push({ target, files: [], warnings: [], skipped: true, error: msg });
      continue;
    }

    try {
      const adapterOpts: AdapterCompileOptions = {};
      if (pluginRoot !== undefined) adapterOpts.pluginRoot = pluginRoot;
      const output = adapter.compile(manifest, adapterOpts);

      // Run postEmit hooks; plugins can append/rewrite files
      const targetCtx = createTargetCtx({ manifest, target, pluginRoot });
      for (const file of output.files) targetCtx.addFile(file);
      for (const w of output.warnings) targetCtx.addWarning(w);
      if (output.nativeCopies) {
        for (const copy of output.nativeCopies) targetCtx.addNativeCopy(copy);
      }
      if (output.postInstall) {
        for (const step of output.postInstall) targetCtx.addPostInstall(step);
      }
      await app.runTarget(targetCtx);

      if (write && outDir) {
        const targetDir = join(resolve(outDir), target);
        // scriptc: promises.rm() with an options object has no lowering; rmSync does.
        rmSync(targetDir, { recursive: true, force: true });
        await mkdir(targetDir, { recursive: true });
        for (const file of targetCtx.files) {
          const filePath = join(targetDir, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.content, 'utf-8');
        }
        if (targetCtx.nativeCopies.length > 0 && pluginRoot) {
          const resolvedRoot = resolve(pluginRoot);
          for (const copy of targetCtx.nativeCopies) {
            const srcPath = sanitizeJoin(resolvedRoot, copy.from);
            const dstPath = sanitizeJoin(targetDir, copy.to);
            await mkdir(resolve(dstPath, '..'), { recursive: true });
            const content = await readFile(srcPath, 'utf-8');
            await writeFile(dstPath, content, 'utf-8');
          }
        }
      }

      if (!silent) {
        logger.info('   ✓ Built {count} file{plural}', {
          count: targetCtx.files.length,
          plural: targetCtx.files.length > 1 ? 's' : '',
        });
        if (targetCtx.warnings.length > 0) {
          for (const w of targetCtx.warnings) logger.warn('   ⚠ {warning}', { warning: w });
        }
        if (targetCtx.postInstall.length > 0) {
          logger.info('   ⓘ {steps}', { steps: targetCtx.postInstall.join('\n   ⓘ ') });
        }
      }

      results.push({
        target,
        files: targetCtx.files,
        warnings: targetCtx.warnings,
        postInstall: targetCtx.postInstall.length > 0 ? targetCtx.postInstall : undefined,
        skipped: false,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) logger.error('   ✗ Build failed for {target}: {msg}', { target, msg });
      results.push({ target, files: [], warnings: [], skipped: true, error: msg });
    }
  }

  return results;
}

// ─── Build Command ──────────────────────────────────────────────────────────

export interface BuildOptions {
  config: LoadedConfig;
  targets?: string[];
  outDir: string;
  strict: boolean;
}

export async function build(options: BuildOptions): Promise<void> {
  const { config, outDir } = options;
  const manifest = config.manifest;
  // CLI --target flag > defineConfig targets > manifest.targets > ALL_TARGETS
  const targetList = resolveTargets(
    options.targets ?? config.configTargets,
    manifest.targets
  );

  logger.info('\n🌉 AgentPlugins Build\n');
  logger.info('Plugin: {name} v{version}', { name: manifest.name, version: manifest.version });
  logger.info('Targets: {targets}', { targets: targetList.join(', ') });
  logger.info('Output: {out}\n', { out: resolve(outDir) });

  // Build the pipeline app once — reused for validation, lint, and compile
  const app = await buildApp(config.plugins ?? []);
  // scriptc: array-literal spreads and Map.keys() have no lowering — append
  // via for-of + push instead (Map entry iteration is supported).
  const knownTargets: any = [];
  for (const t of ALL_TARGETS) knownTargets.push(t);
  for (const [k] of app.adapters) knownTargets.push(k);

  // Universal validation — custom adapter targets are not spuriously warned
  logger.info('🔍 Running universal validation...');
  const universalIssues = validateUniversal(manifest, { knownTargets });
  printIssues(universalIssues);
  const hasErrors = universalIssues.some(i => i.severity === 'error');
  if (hasErrors) {
    throw new Error('Universal validation failed. Fix errors before building.');
  }

  // Lint — includes any lint rules from defineConfig plugins
  logger.info('🔍 Running lint...');
  const inlineSources = await collectInlineSources(manifest, config.root);
  // scriptc: spread arguments are unsupported — build the copy explicitly.
  const extraRules: any = [];
  for (const r of app.lintRules) extraRules.push(r);
  const lintIssues = lint({ manifest, inlineHandlerSource: inlineSources, extraRules });
  printLintIssues(lintIssues);
  const lintErrors = lintIssues.filter(i => i.severity === 'error');
  if (options.strict && lintErrors.length > 0) {
    throw new Error(`Strict mode: ${lintErrors.length} lint error(s) found.`);
  }

  // Compile + write (pass pre-built app to avoid rebuilding)
  const results = await compile({
    manifest,
    targets: targetList,
    write: true,
    outDir,
    pluginRoot: config.root,
    plugins: config.plugins,
    _app: app,
  });

  // Strict mode: fail on warnings
  if (options.strict) {
    const allWarnings = results.flatMap(r => r.warnings);
    if (allWarnings.length > 0) {
      throw new Error(`Strict mode: ${allWarnings.length} warning(s) found.`);
    }
  }

  // Summary
  logger.info('\n✅ Build complete!\n');
  logger.info('Install your plugins:');
  for (const r of results) {
    if (r.skipped) continue;
    const cmd = getInstallCommand(r.target, manifest.name);
    logger.info('  {target}: {cmd}', { target: r.target, cmd });
  }
  logger.info('');
}

function printLintIssues(issues: LintIssue[]): void {
  for (const issue of issues) {
    const field = issue.field ? ` [${issue.field}]` : '';
    const rule = ` (${issue.rule})`;
    const message = `  ${issue.severity === 'error' ? '✗' : '⚠'} ${issue.message}${field}${rule}`;
    if (issue.severity === 'error') {
      logger.error(message);
    } else {
      logger.warn(message);
    }
    if (issue.suggestion) {
      logger.info('     → {suggestion}', { suggestion: issue.suggestion });
    }
  }
}

function printIssues(issues: Array<{ severity: string; field?: string; message: string; suggestion?: string }>): void {
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    const field = issue.field ? `[${issue.field}] ` : '';
    const message = `   ${icon} ${field}${issue.message}`;
    if (issue.severity === 'error') {
      logger.error(message);
    } else if (issue.severity === 'warning') {
      logger.warn(message);
    } else {
      logger.info(message);
    }
    if (issue.suggestion) {
      logger.info('     → {suggestion}', { suggestion: issue.suggestion });
    }
  }
}

function getInstallCommand(target: string, pluginName: string): string {
  const commands: Record<string, string> = {
    claude: `cp -r dist/claude ~/.claude/skills/${pluginName}`,
    codex: `cp -r dist/codex ~/.codex/plugins/`,
    copilot: `copilot plugin install ./dist/copilot`,
    gemini: `gemini extensions install ./dist/gemini`,
    kimi: `cp -r dist/kimi ~/.kimi/plugins/`,
    opencode: `cp dist/opencode/*.ts .opencode/plugins/`,
    pimono: `cp -r dist/pimono ~/.pi/agent/extensions/`,
  };
  return commands[target] || `See ${target} documentation`;
}

async function collectInlineSources(manifest: PluginManifest, pluginRoot: string): Promise<string[]> {
  const sources: string[] = [];
  if (!manifest.hooks) return sources;
  // scriptc: Object.values/for-in have no lowering — enumerate the declared
  // hook names and index into the `any` record instead.
  const hooksAny: any = manifest.hooks;
  for (const hookName of UNIVERSAL_HOOK_NAMES) {
    const def = hooksAny[hookName];
    if (!def) continue;
    const handler = def.handler as { type: string; code?: string; source?: string };
    if (handler.type === 'inline') {
      if (handler.code) {
        sources.push(handler.code);
      } else if (handler.source) {
        try {
          const content = await readFile(sanitizeJoin(resolve(pluginRoot), handler.source), 'utf-8');
          sources.push(content);
        } catch {
          // skip unreadable sources
        }
      }
    }
  }
  return sources;
}
