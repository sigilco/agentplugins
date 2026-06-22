import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'

export default defineConfig({
  title: 'AgentPlugins',
  description: 'Write AI agent plugins once, ship to any harness',
  base: '/agentplugins/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
  ],

  markdown: {
    config(md) {
      md.use(groupIconMdPlugin)
    },
  },

  vite: {
    plugins: [llmstxt(), groupIconVitePlugin()],
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Commands', link: '/reference/commands' },
      { text: 'Schema', link: '/reference/schema' },
      { text: 'GitHub', link: 'https://github.com/sigilco/agentplugins' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Guide',
          items: [
            { text: 'Manifest', link: '/guide/manifest' },
            { text: 'Hooks', link: '/guide/hooks' },
            { text: 'Skills', link: '/guide/skills' },
            { text: 'MCP Servers', link: '/guide/mcp-servers' },
            { text: 'Tools', link: '/guide/tools' },
            { text: 'Creating Plugins', link: '/guide/creating-plugins' },
            { text: 'Linting', link: '/guide/linting' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI Commands', link: '/reference/commands' },
            { text: 'JSON Schema', link: '/reference/schema' },
            { text: 'Agent Paths', link: '/reference/agent-paths' },
            { text: 'Adapters', link: '/reference/adapters' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sigilco/agentplugins' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © AgentPlugins contributors',
    },

    outline: {
      level: 'deep',
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
  },
})
