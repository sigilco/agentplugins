/**
 * AgentPlugins Universal Store
 *
 * Manages the universal plugin store at ~/.agents/plugins/<name>/.
 * Clones plugins from GitHub, symlinks them into every detected agent harness.
 * Skills.sh compatible — reads SKILL.md and scans ~/.agents/skills/.
 */

import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readlinkSync,
  renameSync,
} from 'node:fs';
import { execSync } from 'node:child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPathEntry {
  name: string;
  displayName: string;
  skillPath: string;
  binary: string;
  manifestPath: string;
}

export interface PluginMeta {
  /** Canonical plugin name (from manifest) */
  name: string;
  /** Source URL (normalized GitHub URL) */
  source: string;
  /** Git commit hash at install time */
  commit: string;
  /** ISO timestamp of initial install */
  installedAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Relative path to manifest within the store dir */
  manifestPath: string;
  /** Plugin version from manifest */
  version: string;
}

export interface DetectedAgent {
  name: string;
  displayName: string;
  /** Absolute path to the agent's skill/plugin directory */
  skillPath: string;
  /** Binary name to check */
  binary: string;
  /** Whether the binary was found on PATH */
  binaryFound: boolean;
  /** Whether the skillPath directory exists */
  skillPathExists: boolean;
  /** Path to the agent's config/manifest file */
  manifestPath: string;
}

export interface SymlinkInfo {
  agent: string;
  agentDisplayName: string;
  /** Path of the symlink */
  linkPath: string;
  /** Resolved target of the symlink */
  targetPath: string;
  /** Whether the symlink is valid (points to existing target) */
  valid: boolean;
}

export interface InstalledPlugin {
  meta: PluginMeta;
  /** Absolute path in the store */
  path: string;
  /** Parsed manifest (best-effort) */
  manifest: Record<string, unknown> | null;
  /** Symlinks across detected agents */
  symlinks: SymlinkInfo[];
}

export interface ManifestFindResult {
  /** Relative path to the manifest file within the dir */
  path: string;
  /** Parsed manifest object */
  manifest: Record<string, unknown>;
  /** Type of manifest found */
  type: 'json' | 'skill-md';
}

// ─── Embedded Agent Registry (from spec/v1/agent-paths.json) ─────────────────

export const AGENT_PATHS: readonly AgentPathEntry[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    skillPath: '~/.claude/skills',
    binary: 'claude',
    manifestPath: '~/.claude.json',
  },
  {
    name: 'codex',
    displayName: 'Codex CLI',
    skillPath: '~/.codex/skills',
    binary: 'codex',
    manifestPath: '~/.codex/config.json',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '~/.config/opencode/skills',
    binary: 'opencode',
    manifestPath: '~/.config/opencode/config.json',
  },
  {
    name: 'kimi',
    displayName: 'Kimi',
    skillPath: '~/.kimi/skills',
    binary: 'kimi',
    manifestPath: '~/.kimi/config.json',
  },
  {
    name: 'gemini',
    displayName: 'Gemini CLI',
    skillPath: '~/.gemini/skills',
    binary: 'gemini',
    manifestPath: '~/.gemini/settings.json',
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot CLI',
    skillPath: '~/.copilot/skills',
    binary: 'copilot',
    manifestPath: '~/.copilot/config.json',
  },
  {
    name: 'pimono',
    displayName: 'Pi Mono',
    skillPath: '~/.pi/extensions',
    binary: 'pi',
    manifestPath: '~/.pi/config.json',
  },
] as const;

// ─── Path Helpers ────────────────────────────────────────────────────────────

/** Expand ~ to the home directory */
export function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

/** Universal plugin store path: ~/.agents/plugins */
export function getStorePath(): string {
  return join(homedir(), '.agents', 'plugins');
}

/** Skills.sh compatibility path: ~/.agents/skills */
export function getSkillsCompatPath(): string {
  return join(homedir(), '.agents', 'skills');
}

/** Path for a specific plugin in the store */
export function getPluginStorePath(name: string): string {
  return join(getStorePath(), name);
}

/** Path to the meta file for a plugin */
export function getMetaPath(name: string): string {
  return join(getPluginStorePath(name), '.agentplugins-meta.json');
}

// ─── Agent Detection ─────────────────────────────────────────────────────────

export function getAgentPaths(): readonly AgentPathEntry[] {
  return AGENT_PATHS;
}

/** Check if a binary is available on PATH */
function isBinaryAvailable(binary: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${binary}` : `which ${binary}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect installed agent harnesses.
 * An agent is "detected" if its binary is on PATH or its skillPath exists.
 */
export function detectAgents(): DetectedAgent[] {
  return AGENT_PATHS.map((entry) => {
    const skillPath = expandHome(entry.skillPath);
    const binaryFound = isBinaryAvailable(entry.binary);
    const skillPathExists = existsSync(skillPath);
    return {
      name: entry.name,
      displayName: entry.displayName,
      skillPath,
      binary: entry.binary,
      binaryFound,
      skillPathExists,
      manifestPath: expandHome(entry.manifestPath),
    };
  });
}

/** Get only agents that are actually installed (binary or skill path) */
export function getDetectedAgents(): DetectedAgent[] {
  return detectAgents().filter((a) => a.binaryFound || a.skillPathExists);
}

// ─── URL Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a plugin source URL.
 * Accepts: https://github.com/u/r, git@github.com:u/r.git, u/r
 */
export function normalizeSource(source: string): string {
  let url = source.trim();

  // Shorthand: user/repo → full GitHub URL
  if (!url.includes('://') && !url.startsWith('git@') && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(url)) {
    url = `https://github.com/${url}`;
  }

  // SSH → HTTPS
  if (url.startsWith('git@github.com:')) {
    const path = url.slice('git@github.com:'.length);
    url = `https://github.com/${path}`;
  }

  // Strip trailing .git
  if (url.endsWith('.git')) {
    url = url.slice(0, -4);
  }

  // Strip trailing slash
  url = url.replace(/\/$/, '');

  return url;
}

/** Extract the repo name from a GitHub URL */
export function extractRepoName(source: string): string {
  const normalized = normalizeSource(source);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'unknown-plugin';
}

// ─── Store Operations ────────────────────────────────────────────────────────

/** Ensure the store and skills-compat directories exist */
export function initStore(): void {
  mkdirSync(getStorePath(), { recursive: true });
  mkdirSync(getSkillsCompatPath(), { recursive: true });
}

/**
 * Clone a git repository to a destination directory.
 * Returns the commit hash.
 * Throws on failure.
 */
export function cloneRepo(source: string, dest: string): string {
  const url = normalizeSource(source);
  execSync(`git clone --depth 1 "${url}" "${dest}"`, { stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd: dest, encoding: 'utf-8' }).trim();
}

/** Pull latest changes in a repo directory. Returns new commit hash. */
export function pullRepo(dir: string): string {
  execSync('git pull --ff-only', { cwd: dir, stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
}

// ─── Manifest Finding ────────────────────────────────────────────────────────

const MANIFEST_CANDIDATES = [
  'agentplugins.config.json',
  'manifest.json',
  'package.json',
] as const;

/**
 * Find and parse a JSON manifest in a directory.
 * Does NOT handle TypeScript configs (callers should use jiti for those).
 * Falls back to SKILL.md synthesis for Skills.sh compatibility.
 */
export function findManifestInDir(dir: string): ManifestFindResult | null {
  // Try JSON manifests
  for (const candidate of MANIFEST_CANDIDATES) {
    const fullPath = join(dir, candidate);
    if (existsSync(fullPath)) {
      try {
        const raw = readFileSync(fullPath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;

        // For package.json, extract the manifest-like fields
        if (candidate === 'package.json') {
          if (!data['name'] || typeof data['name'] !== 'string') continue;
          const manifest: Record<string, unknown> = {
            name: data['name'],
            version: data['version'] || '0.0.0',
            description: data['description'] || `Plugin ${data['name']}`,
          };
          // Check for agentplugins field in package.json
          if (data['agentplugins'] && typeof data['agentplugins'] === 'object') {
            Object.assign(manifest, data['agentplugins']);
          }
          return { path: candidate, manifest, type: 'json' };
        }

        // Validate it has a name field
        if (!data['name']) continue;
        return { path: candidate, manifest: data, type: 'json' };
      } catch {
        continue;
      }
    }
  }

  // Try SKILL.md (Skills.sh compatibility)
  const skillPath = join(dir, 'SKILL.md');
  if (existsSync(skillPath)) {
    const content = readFileSync(skillPath, 'utf-8');
    const manifest = synthesizeFromSkillMd(content, basename(dir));
    return { path: 'SKILL.md', manifest, type: 'skill-md' };
  }

  return null;
}

/** Synthesize a minimal manifest from a SKILL.md file (Skills.sh compat) */
function synthesizeFromSkillMd(content: string, fallbackName: string): Record<string, unknown> {
  // Parse YAML frontmatter if present
  let name = fallbackName;
  let description = `Skills.sh plugin: ${fallbackName}`;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  return {
    name,
    version: '0.0.0',
    description,
    skills: [{ name, description, content }],
  };
}

// ─── Plugin Meta ─────────────────────────────────────────────────────────────

/** Read the meta file for a plugin */
export function readMeta(name: string): PluginMeta | null {
  const metaPath = getMetaPath(name);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as PluginMeta;
  } catch {
    return null;
  }
}

/** Write the meta file for a plugin */
export function writeMeta(meta: PluginMeta): void {
  const metaPath = getMetaPath(meta.name);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

// ─── Install / Remove / List / Update ────────────────────────────────────────

export interface InstallOptions {
  /** Source URL */
  source: string;
  /** Canonical plugin name (from manifest) */
  name: string;
  /** Commit hash */
  commit: string;
  /** Relative path to manifest within the plugin dir */
  manifestPath: string;
  /** Version from manifest */
  version: string;
  /** Whether to symlink into detected agents (default: true) */
  symlink?: boolean;
}

export interface InstallResult {
  meta: PluginMeta;
  symlinks: SymlinkInfo[];
}

/**
 * Install a plugin into the store from a cloned directory.
 * Moves the directory to the store, writes meta, creates symlinks.
 */
export function installPlugin(
  cloneDir: string,
  opts: InstallOptions,
): InstallResult {
  initStore();

  const storePath = getPluginStorePath(opts.name);

  // Remove existing if present
  if (existsSync(storePath)) {
    // Unlink existing symlinks first
    for (const agent of getDetectedAgents()) {
      unlinkPluginSymlink(opts.name, agent);
    }
    rmSync(storePath, { recursive: true, force: true });
  }

  // Move clone to store
  renameSync(cloneDir, storePath);

  // Write meta
  const now = new Date().toISOString();
  const meta: PluginMeta = {
    name: opts.name,
    source: normalizeSource(opts.source),
    commit: opts.commit,
    installedAt: now,
    updatedAt: now,
    manifestPath: opts.manifestPath,
    version: opts.version,
  };
  writeFileSync(getMetaPath(opts.name), JSON.stringify(meta, null, 2), 'utf-8');

  // Create symlinks
  const symlinks: SymlinkInfo[] = [];
  if (opts.symlink !== false) {
    const agents = getDetectedAgents();
    for (const agent of agents) {
      const info = symlinkPlugin(opts.name, agent);
      if (info) symlinks.push(info);
    }
  }

  return { meta, symlinks };
}

/**
 * Full add flow: clone from source, find manifest, install.
 * Returns null if no manifest is found (caller can try TS loading).
 */
export function addPluginFromSource(source: string): InstallResult | null {
  initStore();

  const repoName = extractRepoName(source);
  const tempDir = join(getStorePath(), `.tmp-${repoName}-${Date.now()}`);

  // Clean up temp dir if it exists
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });

  // Clone
  const commit = cloneRepo(source, tempDir);

  // Find manifest
  const manifestResult = findManifestInDir(tempDir);
  if (!manifestResult) {
    // Return null — caller may try TS config via jiti
    return null;
  }

  const name = manifestResult.manifest['name'] as string;
  const version = (manifestResult.manifest['version'] as string) || '0.0.0';

  return installPlugin(tempDir, {
    source,
    name,
    commit,
    manifestPath: manifestResult.path,
    version,
  });
}

/** Remove a plugin: unlink all symlinks, delete from store */
export function removePlugin(name: string): void {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) {
    throw new Error(`Plugin "${name}" is not installed`);
  }

  // Unlink symlinks from all agents
  for (const agent of detectAgents()) {
    unlinkPluginSymlink(name, agent);
  }

  // Also unlink from skills-compat
  const skillsLink = join(getSkillsCompatPath(), name);
  if (existsSync(skillsLink)) {
    unlinkSync(skillsLink);
  }

  // Remove from store
  rmSync(storePath, { recursive: true, force: true });
}

/** List all installed plugins */
export function listPlugins(): InstalledPlugin[] {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return [];

  const agents = detectAgents();
  const entries = readdirSync(storePath);

  return entries
    .filter((entry) => !entry.startsWith('.tmp-'))
    .map((name) => {
      const pluginPath = join(storePath, name);
      if (!lstatSync(pluginPath).isDirectory()) return null;

      const meta = readMeta(name);
      const symlinks = getSymlinks(name, agents);

      // Try to parse manifest
      let manifest: Record<string, unknown> | null = null;
      if (meta) {
        const manifestFullPath = join(pluginPath, meta.manifestPath);
        if (existsSync(manifestFullPath)) {
          try {
            if (meta.manifestPath.endsWith('.json') || meta.manifestPath === 'package.json') {
              manifest = JSON.parse(readFileSync(manifestFullPath, 'utf-8'));
            } else if (meta.manifestPath === 'SKILL.md') {
              const result = findManifestInDir(pluginPath);
              manifest = result?.manifest ?? null;
            }
          } catch {
            manifest = null;
          }
        }
      }

      return {
        meta: meta ?? {
          name,
          source: 'unknown',
          commit: 'unknown',
          installedAt: 'unknown',
          updatedAt: 'unknown',
          manifestPath: 'unknown',
          version: 'unknown',
        },
        path: pluginPath,
        manifest,
        symlinks,
      } as InstalledPlugin;
    })
    .filter((p): p is InstalledPlugin => p !== null);
}

/** Get detailed info about a single plugin */
export function getPluginInfo(name: string): InstalledPlugin | null {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) return null;

  const meta = readMeta(name);
  const agents = detectAgents();
  const symlinks = getSymlinks(name, agents);

  let manifest: Record<string, unknown> | null = null;
  if (meta) {
    const manifestFullPath = join(storePath, meta.manifestPath);
    if (existsSync(manifestFullPath)) {
      try {
        if (meta.manifestPath.endsWith('.json') || meta.manifestPath === 'package.json') {
          manifest = JSON.parse(readFileSync(manifestFullPath, 'utf-8'));
        } else if (meta.manifestPath === 'SKILL.md') {
          const result = findManifestInDir(storePath);
          manifest = result?.manifest ?? null;
        }
      } catch {
        manifest = null;
      }
    }
  }

  return {
    meta: meta ?? {
      name,
      source: 'unknown',
      commit: 'unknown',
      installedAt: 'unknown',
      updatedAt: 'unknown',
      manifestPath: 'unknown',
      version: 'unknown',
    },
    path: storePath,
    manifest,
    symlinks,
  };
}

/** Update a plugin: git pull + update meta + refresh symlinks */
export function updatePlugin(name: string): PluginMeta {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) {
    throw new Error(`Plugin "${name}" is not installed`);
  }

  const oldMeta = readMeta(name);
  if (!oldMeta) {
    throw new Error(`Plugin "${name}" has no meta file — corrupted install`);
  }

  // Pull latest
  const newCommit = pullRepo(storePath);

  // Re-find manifest (in case it changed)
  const manifestResult = findManifestInDir(storePath);
  const version = manifestResult?.manifest['version'] as string || oldMeta.version;
  const manifestPath = manifestResult?.path || oldMeta.manifestPath;

  const updatedMeta: PluginMeta = {
    ...oldMeta,
    commit: newCommit,
    updatedAt: new Date().toISOString(),
    version,
    manifestPath,
  };

  writeFileSync(getMetaPath(name), JSON.stringify(updatedMeta, null, 2), 'utf-8');

  // Refresh symlinks
  for (const agent of getDetectedAgents()) {
    unlinkPluginSymlink(name, agent);
    symlinkPlugin(name, agent);
  }

  return updatedMeta;
}

// ─── Symlink Operations ──────────────────────────────────────────────────────

/**
 * Create a symlink from agent's skillPath to the plugin store dir.
 * Returns null if the agent's skillPath doesn't exist.
 */
export function symlinkPlugin(pluginName: string, agent: DetectedAgent): SymlinkInfo | null {
  if (!agent.skillPathExists && !agent.binaryFound) return null;

  // Ensure the agent's skillPath exists
  mkdirSync(agent.skillPath, { recursive: true });

  const linkPath = join(agent.skillPath, pluginName);
  const targetPath = getPluginStorePath(pluginName);

  // Remove existing symlink/file if present
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    try {
      unlinkSync(linkPath);
    } catch {
      rmSync(linkPath, { recursive: true, force: true });
    }
  }

  // Create symlink (relative for portability)
  try {
    symlinkSync(targetPath, linkPath, 'dir');
  } catch {
    // If symlink fails (e.g., permissions on Windows), return null
    return null;
  }

  return {
    agent: agent.name,
    agentDisplayName: agent.displayName,
    linkPath,
    targetPath,
    valid: existsSync(targetPath),
  };
}

/** Remove a plugin's symlink from an agent's skillPath */
export function unlinkPluginSymlink(pluginName: string, agent: DetectedAgent): void {
  const linkPath = join(agent.skillPath, pluginName);
  if (isSymlink(linkPath)) {
    try {
      unlinkSync(linkPath);
    } catch {
      // ignore
    }
  } else if (existsSync(linkPath) && lstatSync(linkPath).isDirectory()) {
    // Not a symlink but a real dir — leave it alone
  }
}

/** Get all symlinks for a plugin across agents */
export function getSymlinks(pluginName: string, agents?: DetectedAgent[]): SymlinkInfo[] {
  const detectedAgents = agents ?? detectAgents();
  const results: SymlinkInfo[] = [];

  for (const agent of detectedAgents) {
    const linkPath = join(agent.skillPath, pluginName);
    if (isSymlink(linkPath)) {
      const targetPath = readlinkSync(linkPath);
      results.push({
        agent: agent.name,
        agentDisplayName: agent.displayName,
        linkPath,
        targetPath,
        valid: existsSync(targetPath),
      });
    } else if (existsSync(linkPath) && lstatSync(linkPath).isDirectory()) {
      // Real directory (not a symlink) — report it as a non-symlink install
      results.push({
        agent: agent.name,
        agentDisplayName: agent.displayName,
        linkPath,
        targetPath: linkPath,
        valid: true,
      });
    }
  }

  return results;
}

/** Check if a path is a symlink */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

export interface DoctorResult {
  storePath: string;
  storeExists: boolean;
  skillsCompatPath: string;
  skillsCompatExists: boolean;
  agents: DetectedAgent[];
  plugins: InstalledPlugin[];
  issues: DoctorIssue[];
}

export interface DoctorIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/** Run diagnostics on the store, agents, and symlinks */
export function runDoctor(): DoctorResult {
  const storePath = getStorePath();
  const skillsCompatPath = getSkillsCompatPath();
  const storeExists = existsSync(storePath);
  const skillsCompatExists = existsSync(skillsCompatPath);
  const agents = detectAgents();
  const plugins = listPlugins();
  const issues: DoctorIssue[] = [];

  // Store checks
  if (!storeExists) {
    issues.push({ level: 'info', message: 'Plugin store does not exist yet — run `agentplugins add` to create it' });
  }

  // Skills compat
  if (!skillsCompatExists) {
    issues.push({ level: 'info', message: 'Skills.sh compat directory does not exist yet' });
  }

  // Agent checks
  const detectedCount = agents.filter((a) => a.binaryFound || a.skillPathExists).length;
  if (detectedCount === 0) {
    issues.push({ level: 'warning', message: 'No agent harnesses detected — install Claude, Codex, or another supported agent' });
  }
  for (const agent of agents) {
    if (agent.binaryFound && !agent.skillPathExists) {
      issues.push({ level: 'info', message: `${agent.displayName} binary found but skill path (${agent.skillPath}) does not exist — will be created on first add` });
    }
  }

  // Symlink checks
  for (const plugin of plugins) {
    const invalidSymlinks = plugin.symlinks.filter((s) => !s.valid);
    for (const s of invalidSymlinks) {
      issues.push({ level: 'error', message: `Plugin "${plugin.meta.name}" has a broken symlink for ${s.agentDisplayName}: ${s.linkPath}` });
    }
    if (plugin.symlinks.length === 0 && detectedCount > 0) {
      issues.push({ level: 'warning', message: `Plugin "${plugin.meta.name}" has no symlinks — run \`agentplugins update ${plugin.meta.name}\` to fix` });
    }
  }

  return {
    storePath,
    storeExists,
    skillsCompatPath,
    skillsCompatExists,
    agents,
    plugins,
    issues,
  };
}
