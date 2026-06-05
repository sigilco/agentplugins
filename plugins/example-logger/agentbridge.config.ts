import { definePlugin } from '@agentbridge/core';

/**
 * AgentBridge Example Logger Plugin
 *
 * A simple plugin that demonstrates cross-platform compatibility.
 * It logs session events and can block dangerous shell commands.
 *
 * This plugin compiles to:
 * - Claude Code (.claude-plugin/)
 * - OpenAI Codex (.codex-plugin/)
 * - GitHub Copilot CLI (plugin.json)
 * - Google Gemini CLI (gemini-extension.json)
 * - Kimi (kimi.plugin.json)
 * - OpenCode (.opencode/plugins/)
 * - Pi Mono (.pi/extensions/)
 */
export default definePlugin({
  name: 'agentbridge-example-logger',
  version: '0.1.0',
  description: 'Cross-platform logging and security plugin for AI agent harnesses',

  // Build for these targets (comment out to build for all)
  targets: ['claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono'],

  // ─── Hooks ────────────────────────────────────────────────────────────────
  hooks: {
    // Log when a session starts and provide context to the agent
    sessionStart: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const timestamp = new Date().toISOString();
          const source = ctx.source || 'unknown';
          console.log(`[Logger] Session ${ctx.sessionId} started from ${source} at ${timestamp}`);

          return {
            additionalContext: `\n## Audit Log Plugin\nAll tool calls are being logged for security review. Plugin active since ${timestamp}.\n`,
          };
        },
      },
    },

    // Log and validate tool calls before execution
    preToolUse: {
      matcher: 'Bash|Read|Write|Edit',
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const timestamp = new Date().toISOString();
          console.log(`[Logger] [${timestamp}] Tool: ${ctx.toolName} | Session: ${ctx.sessionId}`);
          console.log(`[Logger] Input:`, JSON.stringify(ctx.toolInput, null, 2));

          // Security policy: block dangerous commands
          if (ctx.toolName === 'bash' || ctx.toolName === 'Bash') {
            const cmd = JSON.stringify(ctx.toolInput);
            const dangerousPatterns = [
              'rm -rf /',
              'rm -rf /*',
              ':(){ :|:& };:',  // fork bomb
              '> /dev/sda',
              'mkfs',
              'dd if=/dev/zero of=/dev/sda',
            ];

            for (const pattern of dangerousPatterns) {
              if (cmd.includes(pattern)) {
                console.error(`[Logger] BLOCKED dangerous command: ${pattern}`);
                return {
                  block: true,
                  reason: `Security policy: "${pattern}" is not allowed.`,
                  systemMessage: `⚠️ Blocked dangerous command containing "${pattern}"`,
                };
              }
            }
          }

          // Allow the tool call
          return { continue: true };
        },
      },
    },

    // Log after tool execution
    postToolUse: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const timestamp = new Date().toISOString();
          console.log(`[Logger] [${timestamp}] Tool completed: ${ctx.toolName}`);
          // No need to return anything
        },
      },
    },

    // Log session end
    sessionEnd: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const timestamp = new Date().toISOString();
          console.log(`[Logger] Session ${ctx.sessionId} ended at ${timestamp}`);
        },
      },
    },

    // Log user prompt submissions
    userPromptSubmit: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const timestamp = new Date().toISOString();
          const prompt = ctx.userPrompt || '(empty)';
          // Truncate very long prompts
          const truncated = prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt;
          console.log(`[Logger] [${timestamp}] User prompt: ${truncated}`);
        },
      },
    },
  },

  // ─── Skills ───────────────────────────────────────────────────────────────
  skills: [
    {
      name: 'audit-logging',
      description: 'Security audit logging best practices',
      content: `---
name: audit-logging
description: Security audit logging best practices
---

# Audit Logging Skill

When this plugin is active:

1. All tool executions are logged with timestamps
2. Dangerous commands (rm -rf /, fork bombs, disk writes) are automatically blocked
3. Session lifecycle events are tracked
4. Full audit trail is printed to the console

You should inform the user that audit logging is active when performing sensitive operations.
`,
    },
  ],

  // ─── User-Configurable Options ────────────────────────────────────────────
  userConfig: {
    logLevel: {
      type: 'string',
      title: 'Log Level',
      description: 'Logging verbosity: debug, info, warn, error',
      default: 'info',
    },
    blockDangerous: {
      type: 'boolean',
      title: 'Block Dangerous Commands',
      description: 'Automatically block known dangerous shell commands',
      default: true,
    },
  },
});
