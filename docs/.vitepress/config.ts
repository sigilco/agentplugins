import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_SITE = process.env.DOCS_SITE ?? 'https://agentplugins.pages.dev'
const GITHUB_SITE = 'https://github.com/sigilco/agentplugins'
const SPONSOR_SITE = 'https://buy.polar.sh/polar_cl_Mv1gdlG7bw3I70EC9IHtfeSHJj4PEKvA7JAUz23CFhj'

// Serve scripts/install.sh at the site root (agentplugins.pages.dev/install.sh)
// by mirroring it into docs/public/ at config load. scripts/install.sh is the
// single source of truth; docs/public/ is generated, never hand-maintained.
try {
  const publicDir = resolve(__dirname, '../public')
  mkdirSync(publicDir, { recursive: true })
  copyFileSync(resolve(__dirname, '../../scripts/install.sh'), resolve(publicDir, 'install.sh'))
} catch (err) {
  console.warn('[agentplugins docs] could not mirror install.sh into public/:', err)
}

export default withMermaid(defineConfig({
  title: 'AgentPlugins',
  description: 'Write AI agent plugins once, ship to any harness',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: DOCS_SITE,
  },

  head: [
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/img/logo-dark.png' }],
    ['link', { rel: 'alternate icon', href: '/favicon.ico' }],
    ['meta', { name: 'keywords', content: 'ai agent plugin, claude code plugin, codex plugin, opencode plugin, universal agent manifest, ai harness plugin manager' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: DOCS_SITE }],
    ['meta', { property: 'og:title', content: 'AgentPlugins – Universal Plugin Standard for AI Agents' }],
    ['meta', { property: 'og:description', content: 'Write AI agent plugins once, ship to Claude Code, Codex, OpenCode, Copilot, Gemini, Kimi, and Pi Mono. One manifest. Zero lock-in.' }],
    ['meta', { property: 'og:image', content: `${DOCS_SITE}/og.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'AgentPlugins – Universal Plugin Standard for AI Agents' }],
    ['meta', { name: 'twitter:description', content: 'Write AI agent plugins once, ship to Claude Code, Codex, OpenCode, Copilot, Gemini, Kimi, and Pi Mono.' }],
    ['meta', { name: 'twitter:image', content: `${DOCS_SITE}/og.png` }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "AgentPlugins",
      "description": "Universal plugin standard for AI agents. Write once, ship to any harness.",
      "url": DOCS_SITE,
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "All",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "license": "https://www.apache.org/licenses/LICENSE-2.0",
      "codeRepository": "https://github.com/sigilco/agentplugins"
    })],
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llmstxt() as any,
      groupIconVitePlugin() as any,
      // Serve llms.txt / llms-full.txt from .vitepress/dist/ during dev
      {
        name: 'vitepress-dev-llms-txt',
        configureServer(server) {
          server.middlewares.use((req, res) => {
            const url = (req.url ?? '').split('?')[0]
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
    logo: {
      light: '/img/logo-light.png',
      dark: '/img/logo-dark.png',
      alt: 'AgentPlugins',
    },
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Reference', link: '/reference' },
      { text: 'GitHub', link: GITHUB_SITE },
      { text: 'Sponsor', link: SPONSOR_SITE },
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
            { text: 'Capability Matrix', link: '/guide/capability-matrix' },
          ],
        },
        {
          text: 'Concepts',
          items: [
            { text: 'Manifest', link: '/guide/manifest' },
            { text: 'Hooks', link: '/guide/hooks' },
            { text: 'Skills', link: '/guide/skills' },
            { text: 'MCP Servers', link: '/guide/mcp-servers' },
            { text: 'Tools', link: '/guide/tools' },
          ],
        },
        {
          text: 'Authoring',
          items: [
            { text: 'Creating Plugins', link: '/guide/creating-plugins' },
            { text: 'Porting an Existing Plugin', link: '/guide/porting' },
            { text: 'Extending the Build Pipeline', link: '/guide/extending' },
            { text: 'Linting', link: '/guide/linting' },
            { text: 'Ecosystem', link: '/guide/ecosystem' },
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
      { icon: 'github', link: GITHUB_SITE },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the Apache License 2.0.',
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
