/**
 * AgentPlugins Init Command
 *
 * Scaffolds a new AgentPlugins plugin project interactively via @clack/prompts,
 * or non-interactively when --yes is passed.
 */

import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import * as p from '@clack/prompts';

export interface InitOptions {
  name?: string;
  template?: string;
  yes: boolean;
  target?: string;
}

interface ScaffoldAnswers {
  name: string;
  version: string;
  description: string;
  license: string;
  targets: string[];
  hooks: string[];
  template: string;
  skill: boolean;
  skillName: string;
  skillDescription: string;
  mcp: boolean;
  commands: boolean;
}

const TARGET_OPTIONS = [
  { value: 'claude', label: 'Claude', hint: 'Anthropic Claude Code' },
  { value: 'codex', label: 'Codex', hint: 'OpenAI Codex' },
  { value: 'copilot', label: 'Copilot', hint: 'GitHub Copilot' },
  { value: 'gemini', label: 'Gemini', hint: 'Google Gemini' },
  { value: 'kimi', label: 'Kimi', hint: 'Moonshot Kimi' },
  { value: 'opencode', label: 'OpenCode', hint: 'OpenCode agent' },
  { value: 'pimono', label: 'Pi Mono', hint: 'Pi Mono agent' },
];

const HOOK_OPTIONS = [
  { value: 'sessionStart', label: 'sessionStart' },
  { value: 'preToolUse', label: 'preToolUse' },
  { value: 'postToolUse', label: 'postToolUse' },
  { value: 'notification', label: 'notification' },
  { value: 'stop', label: 'stop' },
];

const HOOK_NAMES = ['sessionStart', 'preToolUse', 'postToolUse', 'notification', 'stop'];

const TEMPLATES = ['minimal', 'logger', 'security-guard', 'formatter'] as const;

const DEFAULTS = {
  name: 'my-plugin',
  version: '0.1.0',
  description: 'An AgentPlugins plugin',
  license: 'MIT',
  targets: ['claude', 'codex'],
  hooks: ['sessionStart', 'preToolUse'],
  template: 'logger',
};

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function init(options: InitOptions): Promise<void> {
  if (options.template && !TEMPLATES.includes(options.template as (typeof TEMPLATES)[number])) {
    console.error(chalk.red(`Unknown template: ${options.template}`));
    console.error(chalk.gray(`Available templates: ${TEMPLATES.join(', ')}`));
    process.exit(1);
  }

  let answers: ScaffoldAnswers;

  if (options.yes) {
    answers = getDefaults(options);
    console.log(chalk.bold(`\n🆕 Creating AgentPlugins plugin: ${answers.name}\n`));
    await generateFiles(answers);
    console.log(chalk.green('✅ Plugin scaffolded!\n'));
  } else {
    p.intro('AgentPlugins plugin scaffold');
    answers = await runInteractive(options);
    await generateFiles(answers);
    p.outro('Plugin scaffolded!');
  }

  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray(`  cd ${answers.name}`));
  console.log(chalk.gray('  npm install'));
  console.log(chalk.gray('  npm run validate'));
  console.log(chalk.gray('  npm run build\n'));
}

// ─── Interactive Flow ─────────────────────────────────────────────────────────

async function runInteractive(opts: InitOptions): Promise<ScaffoldAnswers> {
  let name: string;
  if (opts.name) {
    name = toKebabCase(opts.name);
  } else {
    const raw = await p.text({
      message: 'Plugin name (kebab-case)',
      placeholder: 'my-plugin',
      defaultValue: DEFAULTS.name,
      validate: (v) =>
        v.length === 0 || !KEBAB_RE.test(v)
          ? 'Use kebab-case (lowercase letters, digits, hyphens)'
          : undefined,
    });
    name = toKebabCase(assertValue(raw));
  }

  const version = assertValue(
    await p.text({
      message: 'Version',
      initialValue: DEFAULTS.version,
    }),
  );

  const description = assertValue(
    await p.text({
      message: 'Description',
      placeholder: 'Describe what your plugin does...',
      validate: (v) =>
        v.trim().length < 10 ? 'Description must be at least 10 characters' : undefined,
    }),
  );

  const license = assertValue(
    await p.text({
      message: 'License',
      initialValue: DEFAULTS.license,
    }),
  );

  let targets: string[];
  if (opts.target) {
    targets = opts.target.split(',').map((t) => t.trim()).filter(Boolean);
  } else {
    const picked = assertValue(
      await p.multiselect<typeof TARGET_OPTIONS, string>({
        message: 'Target platforms',
        options: TARGET_OPTIONS,
        required: false,
      }),
    );
    targets = picked.length > 0 ? picked : [...DEFAULTS.targets];
  }

  const pickedHooks = assertValue(
    await p.multiselect<typeof HOOK_OPTIONS, string>({
      message: 'Hook coverage',
      options: HOOK_OPTIONS,
      required: false,
    }),
  );
  const hooks = pickedHooks.length > 0 ? pickedHooks : [...DEFAULTS.hooks];

  const includeSkill = assertValue(
    await p.confirm({ message: 'Include a skill?', initialValue: true }),
  );

  let skillName = '';
  let skillDescription = '';
  if (includeSkill) {
    skillName = assertValue(
      await p.text({
        message: 'Skill name',
        placeholder: `${name}-skill`,
        defaultValue: `${name}-skill`,
        validate: (v) => (v.length === 0 ? 'Skill name is required' : undefined),
      }),
    );
    skillDescription = assertValue(
      await p.text({
        message: 'Skill description',
        placeholder: `Describe what the ${name} skill does...`,
        validate: (v) =>
          v.trim().length < 10 ? 'Description must be at least 10 characters' : undefined,
      }),
    );
  }

  const includeMcp = assertValue(
    await p.confirm({ message: 'Include MCP server config?', initialValue: false }),
  );

  const includeCommands = assertValue(
    await p.confirm({ message: 'Include custom command?', initialValue: false }),
  );

  return {
    name,
    version,
    description,
    license,
    targets,
    hooks,
    template: opts.template ?? DEFAULTS.template,
    skill: includeSkill,
    skillName,
    skillDescription,
    mcp: includeMcp,
    commands: includeCommands,
  };
}

// ─── Defaults (--yes path) ─────────────────────────────────────────────────────

function getDefaults(opts: InitOptions): ScaffoldAnswers {
  const name = toKebabCase(opts.name || DEFAULTS.name);
  const targets = opts.target
    ? opts.target.split(',').map((t) => t.trim()).filter(Boolean)
    : [...DEFAULTS.targets];
  return {
    name,
    version: DEFAULTS.version,
    description: DEFAULTS.description,
    license: DEFAULTS.license,
    targets,
    hooks: [...DEFAULTS.hooks],
    template: opts.template ?? DEFAULTS.template,
    skill: true,
    skillName: `${name}-skill`,
    skillDescription: `Default skill for ${name}`,
    mcp: false,
    commands: false,
  };
}

// ─── File Generation ───────────────────────────────────────────────────────────

async function generateFiles(a: ScaffoldAnswers): Promise<void> {
  const cwd = process.cwd();
  const pluginDir = resolve(cwd, a.name);
  await mkdir(pluginDir, { recursive: true });

  await writeFile(resolve(pluginDir, 'agentplugins.config.ts'), buildConfigContent(a));
  await writeFile(resolve(pluginDir, 'package.json'), JSON.stringify(buildPackageJson(a), null, 2) + '\n');
  await writeFile(resolve(pluginDir, 'tsconfig.json'), JSON.stringify(buildTsConfig(), null, 2) + '\n');
  await writeFile(resolve(pluginDir, '.gitignore'), `dist/\nnode_modules/\n*.log\n`);
  await writeFile(resolve(pluginDir, 'README.md'), buildReadme(a));
}

function buildConfigContent(a: ScaffoldAnswers): string {
  const orderedHooks = HOOK_NAMES.filter((h) => a.hooks.includes(h));
  const hooksBlock = orderedHooks
    .map((h) => buildHookEntry(a.template, h, a.name))
    .join('\n');

  const parts: string[] = [];
  parts.push(`import { definePlugin } from '@agentplugins/core';

export default definePlugin({
  name: '${toKebabCase(a.name)}',
  version: '${a.version}',
  description: ${JSON.stringify(a.description)},
  license: '${a.license}',

  // Target platforms to compile for
  targets: [${a.targets.map((t) => `'${t}'`).join(', ')}] as const,`);

  if (orderedHooks.length > 0) {
    parts.push(`
  // Plugin hooks (${a.template} template)
  hooks: {
${hooksBlock}
  },`);
  }

  if (a.skill) {
    const sn = a.skillName || `${a.name}-skill`;
    const sd = a.skillDescription || `Default skill for ${a.name}`;
    parts.push(`
  // Skills the plugin provides
  skills: [
    {
      name: '${sn}',
      description: ${JSON.stringify(sd)},
      content: \`---
name: ${sn}
description: ${sd}
---

Guidance for the ${a.name} plugin. Follow these instructions when this skill is active.
\`,
    },
  ],`);
  }

  if (a.mcp) {
    parts.push(`
  // MCP server configuration
  mcpServers: {
    '${a.name}-mcp': {
      command: 'npx',
      args: ['-y', '${a.name}-mcp-server'],
    },
  },`);
  }

  if (a.commands) {
    parts.push(`
  // Custom commands
  commands: [
    { name: '${a.name}:run', description: 'Run ${a.name}', command: 'node ./dist/run.js' },
  ],`);
  }

  parts.push(`});
`);
  return parts.join('\n');
}

function buildHookEntry(template: string, hookName: string, pluginName: string): string {
  return `    ${hookName}: {
      handler: {
        type: 'inline',
        handler: ${buildHookBody(template, hookName, pluginName)},
      },
    },`;
}

function buildHookBody(template: string, hookName: string, pluginName: string): string {
  switch (template) {
    case 'logger':
      return `async (ctx) => { console.log('[${pluginName}] ${hookName}:', JSON.stringify(ctx, null, 2)); }`;
    case 'security-guard':
      if (hookName === 'preToolUse') {
        return `async (ctx) => {
      const dangerous = ['rm -rf', 'curl', 'wget', 'sh -c', 'chmod 777'];
      const cmd = JSON.stringify(ctx.toolInput || {});
      if (dangerous.some(p => cmd.includes(p))) {
        return { decision: 'block', reason: 'Blocked by security-guard: potentially dangerous command' };
      }
    }`;
      }
      return `async (_ctx) => { /* TODO: implement */ }`;
    case 'formatter':
      if (hookName === 'postToolUse') {
        return `async (ctx) => { /* Transform output */ return { transformed: ctx }; }`;
      }
      return `async (_ctx) => { /* TODO: implement */ }`;
    case 'minimal':
    default:
      return `async (_ctx) => { /* TODO: implement */ }`;
  }
}

function buildPackageJson(a: ScaffoldAnswers) {
  return {
    name: toKebabCase(a.name),
    version: a.version,
    description: a.description,
    license: a.license,
    type: 'module',
    private: true,
    scripts: {
      build: 'agentplugins build',
      validate: 'agentplugins validate',
    },
    devDependencies: {
      '@agentplugins/core': '^0.2.0',
      '@agentplugins/cli': '^0.2.0',
      typescript: '^5.5.0',
    },
  };
}

function buildTsConfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['agentplugins.config.ts'],
  };
}

function buildReadme(a: ScaffoldAnswers): string {
  const targets = a.targets;
  return `# ${a.name}

${a.description}

An [AgentPlugins](https://github.com/sigilco/agentplugins) plugin that works across multiple AI agent harnesses.

## Supported Platforms

${targets.map((t) => `- ${t}`).join('\n')}

## Development

\`\`\`bash
# Install dependencies
npm install

# Validate plugin configuration
npm run validate

# Build for all targets
npm run build

# Build for specific targets
npx agentplugins build --target ${targets.join(',')}
\`\`\`

## Installation

After building, install the appropriate output for your agent harness:

${targets.map((t) => `### ${t}
\`\`\`bash
${getInstallCommand(t, a.name)}
\`\`\``).join('\n\n')}
`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function assertValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled');
    process.exit(0);
  }
  return value;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

function getInstallCommand(target: string, name: string): string {
  const commands: Record<string, string> = {
    claude: `cp -r dist/claude ~/.claude/skills/${name}`,
    codex: `cp -r dist/codex ~/.codex/plugins/`,
    copilot: `copilot plugin install ./dist/copilot`,
    gemini: `gemini extensions install ./dist/gemini`,
    kimi: `cp -r dist/kimi ~/.kimi/plugins/`,
    opencode: `cp dist/opencode/*.ts .opencode/plugins/`,
    pimono: `cp -r dist/pimono ~/.pi/agent/extensions/`,
  };
  return commands[target] || `# See ${target} documentation`;
}
