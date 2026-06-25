import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_SITE = process.env.DOCS_SITE ?? 'https://agentplugins.pages.dev'
const GITHUB_SITE = 'https://github.com/sigilco/agentplugins'

export default withMermaid(defineConfig({
  title: 'AgentPlugins',
  description: 'Write AI agent plugins once, ship to any harness',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
  ],

  markdown: {
    config(md) {
      md.use(groupIconMdPlugin)
      const orig = md.render.bind(md)
      md.render = (src, env) =>
        orig(src.replace(/__DOCS_SITE__/g, DOCS_SITE).replace(/__GITHUB_SITE__/g, GITHUB_SITE), env)
    },
  },

  vite: {
    plugins: [
      llmstxt(),
      groupIconVitePlugin(),
      // Serve llms.txt / llms-full.txt from .vitepress/dist/ during dev
      {
        name: 'vitepress-dev-llms-txt',
        configureServer(server) {
          server.middlewares.use((req, res) => {
            const url = req.url.split('?')[0]
            if (url === '/llms.txt' || url === '/llms-full.txt') {
              const distPath = resolve(__dirname, '.vitepress/dist' + url)
              if (existsSync(distPath)) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                res.end(readFileSync(distPath, 'utf8'))
              } else {
                res.statusCode = 404
                res.end(`Not found: ${url} — run \`npm run build\` first to generate it`)
              }
            }
          })
        },
      },
    ],
  },

  mermaid: { theme: 'default' },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Commands', link: '/reference/commands' },
      { text: 'Schema', link: '/reference/schema' },
      { text: 'GitHub', link: GITHUB_SITE },
      {
        text: 'LLMs',
        items: [
          { text: 'llms.txt', link: '/llms.txt' },
          { text: 'llms-full.txt', link: '/llms-full.txt' },
        ],
      },
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
            { text: 'Tier-1 Capability Matrix', link: '/reference/compat-matrix' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: GITHUB_SITE },
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
}))
