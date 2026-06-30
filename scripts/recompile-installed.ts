// @ts-nocheck
/**
 * One-time recompile script for installed plugins.
 * Run from workspace: npx tsx scripts/recompile-installed.ts
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createJiti } from 'jiti';
import { compile } from '../packages/cli/src/commands/build.js';
import {
  getDetectedAgents,
  findManifestInDir,
  linkCompiledPlugin,
  symlinkPlugin,
  unlinkCompiledPlugin,
  unlinkPluginSymlink,
  unlinkNativeArtifacts,
  linkPluginSkills,
  linkNativeArtifacts,
  type PluginManifest,
} from '@agentplugins/core';

async function tryTsConfig(pluginDir: string) {
  const candidates = ['agentplugins.config.ts', 'agentplugins.config.js'];
  for (const c of candidates) {
    const fp = join(pluginDir, c);
    if (!existsSync(fp)) continue;
    try {
      // Map @agentplugins/* so jiti can resolve workspace packages from the plugin dir
      const wsRoot = new URL('../', import.meta.url).pathname;
      const alias: Record<string, string> = {
        '@agentplugins/core': join(wsRoot, 'packages/core/dist/index.js'),
      };
      const loader = createJiti(fp, { interopDefault: true, alias });
      const mod = await loader.import(fp);
      const exported = (mod as any)?.default ?? mod;
      const manifest = typeof exported === 'function' ? await (exported as () => Promise<any>)() : exported;
      if (manifest?.name) return manifest;
    } catch(e: any) { console.error(`jiti error for ${c}:`, e.message); }
  }
  return null;
}

// Universal = plugin has authoring fields that drive compilation
const AUTHORING_FIELDS = ['commands', 'agents', 'hooks', 'skills', 'tools', 'nativeEntry', 'targets'];

const plugins = ['agentplugins-goal', 'agentplugins-autoresearch', 'caveman-installer', 'ponytail', 'pi-btw'];
const agents = getDetectedAgents();
const targets = agents.filter(a => a.pluginPath).map(a => a.name) as any[];

for (const name of plugins) {
  const pluginDir = join(homedir(), '.agents/plugins', name);
  if (!existsSync(pluginDir)) { console.log(`Skip ${name} — not installed`); continue; }

  // Resolve manifest: JSON/SKILL.md first; also try TS config when no authoring fields found
  // (goal has package.json + agentplugins.config.ts; the latter carries the real manifest)
  let manifest: Record<string, unknown> | null = null;
  let isUniversal = false;

  const found = findManifestInDir(pluginDir);
  manifest = found?.manifest ?? null;
  isUniversal = found ? AUTHORING_FIELDS.some(f => f in found.manifest) : false;

  if (!isUniversal) {
    const tsManifest = await tryTsConfig(pluginDir);
    if (tsManifest) {
      manifest = tsManifest; // prefer richer TS manifest for compile
      isUniversal = true;
    }
  }

  // Compile only universal plugins (skip for harness-native with no authoring fields)
  if (isUniversal && manifest) {
    const distDir = join(pluginDir, '.agentplugins-dist');
    console.log(`\n=== Recompile ${name} for ${targets.join(', ')} ===`);
    try {
      await compile({ manifest: manifest as unknown as PluginManifest, targets, write: true, outDir: distDir, pluginRoot: pluginDir, silent: false });
      console.log(`Compiled OK`);
    } catch (e: any) {
      console.warn(`Compile warning for ${name}: ${e.message}`);
    }
  } else {
    console.log(`\n=== Link refresh ${name} (native) ===`);
  }

  // Always refresh links — no manifest guard
  for (const agent of agents) {
    unlinkCompiledPlugin(name, agent);
    unlinkPluginSymlink(name, agent);
    unlinkNativeArtifacts(name, agent);
    if (isUniversal && agent.pluginPath) {
      const infos = linkCompiledPlugin(name, agent);
      if (infos.length > 0) continue;
    }
    symlinkPlugin(name, agent);
    linkNativeArtifacts(name, agent);
  }
  linkPluginSkills(name, agents);
  console.log(`Links refreshed`);
}
console.log('\nDone!');
