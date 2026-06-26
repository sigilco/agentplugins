import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readlinkSync,
  lstatSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/store.js';
import type { DetectedAgent } from '../src/store.js';

vi.mock('node:os', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:os')>();
  return { ...mod, homedir: vi.fn() };
});

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '/tmp/fake-skills',
    binary: 'opencode',
    binaryFound: true,
    skillPathExists: true,
    manifestPath: '/tmp/fake-manifest',
    ...overrides,
  };
}

function readLinkTarget(linkPath: string): string {
  return readlinkSync(linkPath);
}

function assertIsSymlink(linkPath: string): void {
  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
}

function pathExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

describe('linkPluginSkills', () => {
  let tmpRoot: string;
  let pluginName: string;
  let pluginDir: string;
  let skillsDir: string;
  let skillsCompatPath: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `linkPluginSkills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpRoot, { recursive: true });
    vi.mocked(homedir).mockReturnValue(tmpRoot);
    pluginName = 'test-plugin';
    pluginDir = join(tmpRoot, '.agents', 'plugins', pluginName);
    skillsDir = join(pluginDir, 'skills');
    skillsCompatPath = join(tmpRoot, '.agents', 'skills');
    store.flushLinkErrors();
  });

  afterEach(() => {
    vi.mocked(homedir).mockReset();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeSkill(skillDirName: string, skillMdContent: string): string {
    const skillPath = join(skillsDir, skillDirName);
    mkdirSync(skillPath, { recursive: true });
    writeFileSync(join(skillPath, 'SKILL.md'), skillMdContent);
    return skillPath;
  }

  it('returns [] when plugin has no skills/ directory', () => {
    mkdirSync(pluginDir, { recursive: true });
    const result = store.linkPluginSkills(pluginName, []);
    expect(result).toEqual([]);
  });

  it('returns [] when skills/ exists but is empty (no subdirs with SKILL.md)', () => {
    mkdirSync(skillsDir, { recursive: true });
    const result = store.linkPluginSkills(pluginName, []);
    expect(result).toEqual([]);
  });

  it('creates skills-compat symlink for a skill dir with SKILL.md', () => {
    const skillPath = makeSkill('my-skill', '# My Skill\n');
    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      agent: 'skills-compat',
      agentDisplayName: 'Skills.sh compat',
      linkPath: join(skillsCompatPath, 'my-skill'),
      targetPath: skillPath,
      valid: true,
    });
    assertIsSymlink(result[0].linkPath);
    expect(readLinkTarget(result[0].linkPath)).toBe(skillPath);
  });

  it('reads frontmatter name: field and uses it as skillName (sanitized)', () => {
    const skillPath = makeSkill('dir-name', '---\nname: my-cool-skill\n---\n# Skill\n');

    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'my-cool-skill'));
    assertIsSymlink(result[0].linkPath);
    expect(readLinkTarget(result[0].linkPath)).toBe(skillPath);
  });

  it('falls back to directory name when SKILL.md has no frontmatter', () => {
    const skillPath = makeSkill('fallback-skill', '# Fallback Skill\n');
    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'fallback-skill'));
    assertIsSymlink(result[0].linkPath);
    expect(readLinkTarget(result[0].linkPath)).toBe(skillPath);
  });

  it('falls back to directory name when frontmatter has no name: field', () => {
    const skillPath = makeSkill('no-name-skill', '---\ndescription: cool\n---\n# Skill\n');
    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'no-name-skill'));
    assertIsSymlink(result[0].linkPath);
    expect(readLinkTarget(result[0].linkPath)).toBe(skillPath);
  });

  it('sanitizes frontmatter name and falls back to dir name when sanitized name is invalid', () => {
    const skillPath = makeSkill('dir-name', '---\nname: My Skill!\n---\n# Skill\n');
    const result = store.linkPluginSkills(pluginName, []);

    // sanitizeName('My Skill!') throws, so it falls back to dir-name
    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'dir-name'));
    assertIsSymlink(result[0].linkPath);
    expect(readLinkTarget(result[0].linkPath)).toBe(skillPath);
  });

  it('skips non-directory entries in skills/', () => {
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'not-a-skill.txt'), 'oops');
    const skillPath = makeSkill('real-skill', '# Real\n');

    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'real-skill'));
    expect(pathExists(join(skillsCompatPath, 'not-a-skill.txt'))).toBe(false);
  });

  it('skips skill dirs without SKILL.md', () => {
    mkdirSync(skillsDir, { recursive: true });
    const noSkillMdDir = join(skillsDir, 'no-skill-md');
    mkdirSync(noSkillMdDir, { recursive: true });
    const skillPath = makeSkill('has-skill-md', '# Skill\n');

    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(skillsCompatPath, 'has-skill-md'));
    expect(pathExists(join(skillsCompatPath, 'no-skill-md'))).toBe(false);
  });

  it('creates per-agent symlink when agent.skillPathExists = true', () => {
    const skillPath = makeSkill('agent-skill', '# Agent Skill\n');
    const agentSkillPath = join(tmpRoot, 'agent-skills');
    const agent = makeAgent({ skillPath: agentSkillPath, skillPathExists: true, binaryFound: false });

    const result = store.linkPluginSkills(pluginName, [agent]);

    const agentLink = join(agentSkillPath, 'agent-skill');
    expect(result.some((r) => r.agent === 'opencode' && r.linkPath === agentLink)).toBe(true);
    assertIsSymlink(agentLink);
    expect(readLinkTarget(agentLink)).toBe(skillPath);
  });

  it('skips agent when both skillPathExists and binaryFound are false', () => {
    const skillPath = makeSkill('skipped-agent-skill', '# Skill\n');
    const agentSkillPath = join(tmpRoot, 'agent-skills');
    const agent = makeAgent({ skillPath: agentSkillPath, skillPathExists: false, binaryFound: false });

    const result = store.linkPluginSkills(pluginName, [agent]);

    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('skills-compat');
    expect(pathExists(join(agentSkillPath, 'skipped-agent-skill'))).toBe(false);
  });

  it('creates per-agent symlink when binaryFound = true even if skillPathExists = false', () => {
    const skillPath = makeSkill('binary-only-skill', '# Skill\n');
    const agentSkillPath = join(tmpRoot, 'agent-skills');
    const agent = makeAgent({ skillPath: agentSkillPath, skillPathExists: false, binaryFound: true });

    const result = store.linkPluginSkills(pluginName, [agent]);

    const agentLink = join(agentSkillPath, 'binary-only-skill');
    expect(result.some((r) => r.agent === 'opencode' && r.linkPath === agentLink)).toBe(true);
    assertIsSymlink(agentLink);
    expect(readLinkTarget(agentLink)).toBe(skillPath);
  });

  it('is idempotent: re-running unlinks existing symlinks first', () => {
    const skillPath = makeSkill('idempotent-skill', '# Skill\n');

    const first = store.linkPluginSkills(pluginName, []);
    expect(first).toHaveLength(1);
    assertIsSymlink(first[0].linkPath);

    const second = store.linkPluginSkills(pluginName, []);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject(first[0]);
    assertIsSymlink(second[0].linkPath);
    expect(readLinkTarget(second[0].linkPath)).toBe(skillPath);
  });

  it('creates symlinks for multiple agents', () => {
    const skillPath = makeSkill('multi-agent-skill', '# Skill\n');
    const opencodeSkillPath = join(tmpRoot, 'opencode-skills');
    const claudeSkillPath = join(tmpRoot, 'claude-skills');
    const agents: DetectedAgent[] = [
      makeAgent({ name: 'opencode', displayName: 'OpenCode', skillPath: opencodeSkillPath, skillPathExists: true }),
      makeAgent({ name: 'claude', displayName: 'Claude Code', skillPath: claudeSkillPath, skillPathExists: true }),
    ];

    const result = store.linkPluginSkills(pluginName, agents);

    expect(result).toHaveLength(3); // skills-compat + 2 agents
    const byAgent = new Map(result.map((r) => [r.agent, r]));
    expect(byAgent.has('skills-compat')).toBe(true);
    expect(byAgent.has('opencode')).toBe(true);
    expect(byAgent.has('claude')).toBe(true);

    assertIsSymlink(join(opencodeSkillPath, 'multi-agent-skill'));
    assertIsSymlink(join(claudeSkillPath, 'multi-agent-skill'));
    expect(readLinkTarget(join(opencodeSkillPath, 'multi-agent-skill'))).toBe(skillPath);
    expect(readLinkTarget(join(claudeSkillPath, 'multi-agent-skill'))).toBe(skillPath);
  });

  it('records link error when symlinkSync fails (destination exists as non-symlink)', () => {
    const skillPath = makeSkill('error-skill', '# Skill\n');
    mkdirSync(skillsCompatPath, { recursive: true });
    // Place a regular file where the compat symlink should be created
    writeFileSync(join(skillsCompatPath, 'error-skill'), 'blocking file');

    const result = store.linkPluginSkills(pluginName, []);

    expect(result).toHaveLength(0);
    const errors = store.flushLinkErrors();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes('error-skill') && e.includes('skills-compat'))).toBe(true);
  });
});
