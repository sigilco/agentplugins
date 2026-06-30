/**
 * AgentPlugins Add Command
 *
 * Clones a plugin from GitHub, installs it to the universal store,
 * and symlinks it into every detected agent harness.
 */

import {
  initStore,
  normalizeSource,
  extractRepoName,
  parseSubdir,
  parseBranch,
  cloneRepo,
  findManifestInDir,
  installPlugin,
  getDetectedAgents,
  getStorePath,
  securityPlugin,
} from '@agentplugins/core';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { compile } from './build.js';
import { runSetupFlow } from './setup.js';
import { createApp, createInstallCtx, AbortError } from '@agentplugins/pipeline';
import { getCliLogger } from '../logger.js';
import type { PluginManifest } from '@agentplugins/core';

const logger = getCliLogger();

export interface AddOptions {
  source: string;
  yes?: boolean;
  noSetup?: boolean;
}

export async function add(options: AddOptions): Promise<void> {
  const subdir = parseSubdir(options.source);
  const branch = parseBranch(options.source);
  const source = normalizeSource(options.source);
  const repoName = extractRepoName(source);

  logger.info('\n📥 AgentPlugins Add\n');
  logger.info('Source:  {source}', { source });
  logger.info('Store:   {store}\n', { store: getStorePath() });

  initStore();

  // Clone to temp dir
  const tempDir = join(getStorePath(), `.tmp-${repoName}-${Date.now()}`);
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });

  logger.info('Cloning repository...');
  let commit: string;
  try {
    commit = cloneRepo(source, tempDir, branch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('\nFailed to clone: {msg}', { msg });
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }
  logger.info('Commit: {commit}', { commit });

  // Resolve subdir — for monorepo tree URLs, look inside the subdirectory
  const pluginDir = subdir ? join(tempDir, subdir) : tempDir;

  // Find manifest — try JSON/SKILL.md first
  let manifestResult = findManifestInDir(pluginDir);

  // Fallback: try TypeScript config via jiti
  if (!manifestResult) {
    manifestResult = await tryTsConfig(pluginDir);
  }

  if (!manifestResult) {
    logger.error('\nNo plugin manifest found in repository.');
    logger.error('Expected one of: agentplugins.config.ts, agentplugins.config.json, manifest.json, package.json, SKILL.md');
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  const rawName = manifestResult.manifest['name'] as string;
  // Strip npm scope prefix (@scope/name → name) for use as a filesystem-safe plugin identifier
  const name = rawName.replace(/^@[^/]+\//, '');
  const version = (manifestResult.manifest['version'] as string) || '0.0.0';

  logger.info('\nPlugin: {name} v{version}', { name, version });
  logger.info('Manifest: {path} ({type})', { path: manifestResult.path, type: manifestResult.type });

  // Security: run pinned integrity check + script policy via pipeline
  const installApp = createApp().use(securityPlugin);
  const installCtx = createInstallCtx({
    pluginName: name,
    installDir: tempDir,
    manifest: manifestResult.manifest as unknown as PluginManifest,
    meta: {},
  });
  try {
    await installApp.runInstall(installCtx);
  } catch (err) {
    if (err instanceof AbortError) {
      logger.error('\n{msg}', { msg: err.message });
      rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }
    throw err;
  }

  // Detect agents
  const agents = getDetectedAgents();
  if (agents.length === 0) {
    logger.warn('\n⚠  No agent harnesses detected. Plugin will be stored but not symlinked.');
    logger.info('Install Claude, Codex, or another supported agent to enable symlinking.');
  } else {
    logger.info('Detected {count} agent{plural}: {agents}', {
      count: agents.length,
      plural: agents.length > 1 ? 's' : '',
      agents: agents.map((a) => a.displayName).join(', '),
    });
  }

  // Compile for harnesses that load compiled artifacts (opencode, pimono)
  const compilableAgents = agents.filter((a) => a.pluginPath);
  if (compilableAgents.length > 0) {
    const targets = compilableAgents.map((a) => a.name);
    logger.info('\nCompiling for {targets}...', { targets: targets.join(', ') });
    const distDir = join(pluginDir, '.agentplugins-dist');
    try {
      await compile({
        manifest: manifestResult.manifest as unknown as PluginManifest,
        targets: targets as any,
        write: true,
        outDir: distDir,
        pluginRoot: pluginDir,
        silent: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('\n⚠  Compilation failed: {msg}', { msg });
      logger.info('Plugin will be installed without compiled artifacts.');
    }
  }

  // Install (also creates per-skill flat links via installPlugin → linkPluginSkills)
  const result = installPlugin(tempDir, {
    source,
    name,
    commit,
    manifestPath: manifestResult.path,
    version,
    ...(subdir ? { subdir } : {}),
  });

  // Summary
  logger.info('\n✅ Installed {name} v{version}', { name, version });
  logger.info('   Store: {store}', { store: `${getStorePath()}/${name}` });

  if (result.symlinks.length > 0) {
    logger.info('\nInstalled to:');
    for (const s of result.symlinks) {
      logger.info('   {agent}: {path}', { agent: s.agentDisplayName, path: s.linkPath });
    }
  }

  await runSetupFlow({
    name,
    pluginDir,
    manifest: manifestResult.manifest,
    yes: options.yes,
    noSetup: options.noSetup,
  });

  logger.info('');
}

/** Try loading a TypeScript config via jiti */
async function tryTsConfig(dir: string): Promise<{ path: string; manifest: Record<string, unknown>; type: 'json' | 'skill-md' } | null> {
  const candidates = ['agentplugins.config.ts', 'agentplugins.config.js', 'agentplugins.config.mjs'];
  for (const candidate of candidates) {
    const fullPath = join(dir, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      const jiti = (await import('jiti')).default as unknown as (
        filename: string,
        opts?: Record<string, unknown>
      ) => { import: (id: string, opts?: Record<string, unknown>) => Promise<unknown> };
      const loader = jiti(fullPath, { interopDefault: true, esmResolve: true });
      const mod = await loader.import(fullPath, { default: true });
      const exported = (mod as Record<string, unknown>)?.['default' as keyof typeof mod] ?? mod;
      const manifest = typeof exported === 'function'
        ? await (exported as () => Promise<Record<string, unknown>>)()
        : exported as Record<string, unknown>;
      if (manifest && typeof manifest['name'] === 'string') {
        return { path: candidate, manifest, type: 'json' };
      }
    } catch {
      continue;
    }
  }
  return null;
}
