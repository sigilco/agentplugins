/**
 * AgentPlugins Init Command
 *
 * Scaffolds a new AgentPlugins plugin project.
 */

import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';

export interface InitOptions {
  name: string;
  targets: string[];
}

export async function init(options: InitOptions): Promise<void> {
  const { name, targets } = options;
  const cwd = process.cwd();
  const pluginDir = resolve(cwd, name);

  console.log(chalk.bold(`\n🆕 Creating AgentPlugins plugin: ${name}\n`));

  // Create directory
  await mkdir(pluginDir, { recursive: true });

  // ─── agentplugins.config.ts ────────────────────────────────────────────────
  const configContent = `import { definePlugin } from '@agentplugins/core';

export default definePlugin({
  name: '${toKebabCase(name)}',
  version: '0.1.0',
  description: 'My AgentPlugins plugin — works across multiple AI agent harnesses',

  // Target platforms to compile for
  targets: [${targets.map(t => `'${t}'`).join(', ')}] as const,

  // Plugin hooks
  hooks: {
    sessionStart: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          console.log('[AgentPlugins] Session started:', ctx.sessionId);
          return {
            additionalContext: '${name} plugin is active. Log all tool usage for audit.',
          };
        },
      },
    },
    preToolUse: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          console.log('[AgentPlugins] Tool call:', ctx.toolName, JSON.stringify(ctx.toolInput));
          // Return nothing to allow the tool call
        },
      },
    },
  },

  // Skills the plugin provides
  skills: [
    {
      name: '${toKebabCase(name)}-skill',
      description: 'Default skill for ${name}',
      content: \`---
name: ${toKebabCase(name)}-skill
description: Default skill for ${name}
---

When using this plugin, always log your actions for transparency.
\`,
    },
  ],
});
`;
  await writeFile(resolve(pluginDir, 'agentplugins.config.ts'), configContent);

  // ─── package.json ─────────────────────────────────────────────────────────
  const packageJson = {
    name: toKebabCase(name),
    version: '0.1.0',
    description: `AgentPlugins plugin — works across ${targets.join(', ')}`,
    type: 'module',
    private: true,
    scripts: {
      build: 'agentplugins build',
      validate: 'agentplugins validate',
    },
    devDependencies: {
      '@agentplugins/core': '^0.1.0',
      '@agentplugins/cli': '^0.1.0',
      typescript: '^5.5.0',
    },
  };
  await writeFile(resolve(pluginDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // ─── tsconfig.json ────────────────────────────────────────────────────────
  const tsconfig = {
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
  await writeFile(resolve(pluginDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  // ─── .gitignore ───────────────────────────────────────────────────────────
  await writeFile(resolve(pluginDir, '.gitignore'), `dist/
node_modules/
*.log
`);

  // ─── README.md ────────────────────────────────────────────────────────────
  const readme = `# ${name}

An [AgentPlugins](https://github.com/sigilco/agentplugins) plugin that works across multiple AI agent harnesses.

## Supported Platforms

${targets.map(t => `- ${t}`).join('\n')}

## Development

\`\`\`bash
# Install dependencies
npm install

# Validate plugin configuration
npm run validate

# Build for all targets
npm run build

# Build for specific targets
npx agentplugins build --target claude,codex
\`\`\`

## Installation

After building, install the appropriate output for your agent harness:

${targets.map(t => `### ${t}
\`\`\`bash
${getInstallCommand(t, name)}
\`\`\``).join('\n\n')}
`;
  await writeFile(resolve(pluginDir, 'README.md'), readme);

  console.log(chalk.green('✅ Plugin scaffolded!\n'));
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray(`  cd ${name}`));
  console.log(chalk.gray('  npm install'));
  console.log(chalk.gray('  npm run validate'));
  console.log(chalk.gray('  npm run build\n'));
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
