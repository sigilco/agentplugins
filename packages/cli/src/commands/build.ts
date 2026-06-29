/**
 * AgentPlugins Build Command
 *
 * Compiles a universal plugin into platform-specific packages.
 */

import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import chalk from 'chalk';
import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
  type TargetPlatform,
  type PluginManifest,
  type CompileOptions as AdapterCompileOptions,
} from '@agentplugins/core';
import { sanitizeJoin, lint, registerEmitter, type LintIssue } from '@agentplugins/compile';
import { createApp, createBuildCtx, createTargetCtx, AbortError } from '@agentplugins/pipeline';
import type { App, Plugin } from '@agentplugins/pipeline';
import type { LoadedConfig } from '../config.js';

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

async function buildApp(userPlugins: Plugin[] = []): Promise<App> {
  const app = createApp();

  // Register builtin adapters first (lower precedence)
  for (const { platform, pkg, exportName } of BUILTIN_ADAPTER_SPECS) {
    try {
      // @ts-ignore — loaded dynamically at runtime
      const mod = await import(pkg);
      const factory = mod[exportName] as (() => ReturnType<typeof mod[typeof exportName]>) | undefined;
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
    registerEmitter(emitter as Parameters<typeof registerEmitter>[0]);
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
    const adapter = app.adapters.get(target);
    if (!adapter) {
      results.push({ target, files: [], warnings: [], skipped: true });
      continue;
    }

    if (!silent) console.log(chalk.blue(`\n📦 Building for ${target}...`));

    const platformIssues = validateForPlatform(manifest, target);
    const platformErrors = platformIssues.filter(i => i.severity === 'error');
    if (platformErrors.length > 0) {
      const msg = `${platformErrors.length} validation error${platformErrors.length > 1 ? 's' : ''}`;
      if (!silent) console.log(chalk.red(`   ✗ Build failed for ${target} (${msg})`));
      results.push({ target, files: [], warnings: [], skipped: true, error: msg });
      continue;
    }

    try {
      const output = adapter.compile(manifest, { pluginRoot } as AdapterCompileOptions);

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
        await rm(targetDir, { recursive: true, force: true });
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
        console.log(chalk.green(`   ✓ Built ${targetCtx.files.length} file${targetCtx.files.length > 1 ? 's' : ''}`));
        if (targetCtx.warnings.length > 0) {
          for (const w of targetCtx.warnings) console.log(chalk.yellow(`   ⚠ ${w}`));
        }
        if (targetCtx.postInstall.length > 0) {
          console.log(chalk.cyan(`   ⓘ ${targetCtx.postInstall.join('\n   ⓘ ')}`));
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
      if (err instanceof AbortError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) console.log(chalk.red(`   ✗ Build failed for ${target}: ${msg}`));
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
    options.targets as TargetPlatform[] | undefined
      ?? config.configTargets as TargetPlatform[] | undefined,
    manifest.targets
  );

  console.log(chalk.bold('\n🌉 AgentPlugins Build\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}`));
  console.log(chalk.gray(`Targets: ${targetList.join(', ')}`));
  console.log(chalk.gray(`Output: ${resolve(outDir)}\n`));

  // Build the pipeline app once — reused for validation, lint, and compile
  const app = await buildApp(config.plugins ?? []);
  const knownTargets = [...ALL_TARGETS, ...app.adapters.keys()];

  // Universal validation — custom adapter targets are not spuriously warned
  console.log(chalk.blue('🔍 Running universal validation...'));
  const universalIssues = validateUniversal(manifest, { knownTargets });
  printIssues(universalIssues);
  const hasErrors = universalIssues.some(i => i.severity === 'error');
  if (hasErrors) {
    throw new Error('Universal validation failed. Fix errors before building.');
  }

  // Lint — includes any lint rules from defineConfig plugins
  console.log(chalk.blue('🔍 Running lint...'));
  const inlineSources = await collectInlineSources(manifest, config.root);
  const lintIssues = lint({ manifest, inlineHandlerSource: inlineSources, extraRules: [...app.lintRules] });
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
  console.log(chalk.bold('\n✅ Build complete!\n'));
  console.log(chalk.gray('Install your plugins:'));
  for (const r of results) {
    if (r.skipped) continue;
    const cmd = getInstallCommand(r.target, manifest.name);
    console.log(chalk.gray(`  ${r.target}: ${cmd}`));
  }
  console.log();
}

function printLintIssues(issues: LintIssue[]): void {
  for (const issue of issues) {
    const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    const field = issue.field ? chalk.gray(`[${issue.field}] `) : '';
    console.log(color(`   ${icon} ${field}${issue.message}`));
    if (issue.suggestion) {
      console.log(chalk.cyan(`     → ${issue.suggestion}`));
    }
  }
}

function printIssues(issues: Array<{ severity: string; field?: string; message: string; suggestion?: string }>): void {
  for (const issue of issues) {
    const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.gray;
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    const field = issue.field ? chalk.gray(`[${issue.field}] `) : '';
    console.log(color(`   ${icon} ${field}${issue.message}`));
    if (issue.suggestion) {
      console.log(chalk.cyan(`     → ${issue.suggestion}`));
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
  for (const def of Object.values(manifest.hooks)) {
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
