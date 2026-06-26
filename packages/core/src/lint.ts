/**
 * AgentPlugins Lint System
 *
 * Static analysis layer that runs registered rules over a plugin manifest,
 * catching quality and safety issues beyond structural validation.
 */

import type { PluginManifest } from './types.js';

export interface LintIssue {
  rule: string;
  severity: 'error' | 'warning';
  field?: string;
  message: string;
  suggestion?: string;
}

export interface LintContext {
  manifest: PluginManifest;
  inlineHandlerSource?: string[];
}

export interface LintRule {
  id: string;
  description: string;
  run: (ctx: LintContext) => LintIssue[];
}

const KEBAB_CASE_RE = /^[a-z][a-z0-9-]*$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Patterns always blocked — no capability unlocks these. */
const ALWAYS_BLOCKED_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /fs\.unlink(Sync)?\s*\(/,
  /\bprocess\.exit\s*\(/,
];

/** Patterns blocked unless `capabilities: ['subprocess']` is declared. */
const SUBPROCESS_PATTERNS: RegExp[] = [
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /\bchild_process\b/,
];

const SAFETY_PATTERNS: RegExp[] = [
  ...ALWAYS_BLOCKED_PATTERNS,
  ...SUBPROCESS_PATTERNS,
];

const SECRET_PATTERNS: RegExp[] = [
  /(?:sk|pk|AKIA|ghp|gho|github_pat)_[A-Za-z0-9]{16,}/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/i,
];

const namingRule: LintRule = {
  id: 'naming',
  description: 'Plugin name must be kebab-case and must not self-reference the platform',
  run: ({ manifest }) => {
    const issues: LintIssue[] = [];
    const { name } = manifest;
    if (!KEBAB_CASE_RE.test(name)) {
      issues.push({
        rule: 'naming',
        severity: 'error',
        field: 'name',
        message: `Plugin name "${name}" must be kebab-case (lowercase letters, digits, hyphens; must start with a letter)`,
        suggestion: 'Use a name like "my-cool-plugin"',
      });
    }
    if (name.toLowerCase().startsWith('agentplugin')) {
      issues.push({
        rule: 'naming',
        severity: 'error',
        field: 'name',
        message: 'Plugin name must not be prefixed with "agentplugin" (anti-self-reference)',
        suggestion: 'Choose a name that describes what the plugin does',
      });
    }
    return issues;
  },
};

const versioningRule: LintRule = {
  id: 'versioning',
  description: 'Plugin version must follow semantic versioning',
  run: ({ manifest }) => {
    if (!SEMVER_RE.test(manifest.version)) {
      return [
        {
          rule: 'versioning',
          severity: 'error',
          field: 'version',
          message: `Version "${manifest.version}" is not valid semantic versioning`,
          suggestion: 'Use format "MAJOR.MINOR.PATCH" e.g. "1.0.0"',
        },
      ];
    }
    return [];
  },
};

const descriptionRule: LintRule = {
  id: 'description',
  description: 'Plugin should have a meaningful description of at least 10 characters',
  run: ({ manifest }) => {
    if (!manifest.description || manifest.description.length === 0) {
      return [
        {
          rule: 'description',
          severity: 'warning',
          field: 'description',
          message: 'Description is missing — add one for discoverability',
          suggestion: 'Describe what the plugin does in a sentence',
        },
      ];
    }
    if (manifest.description.length < 10) {
      return [
        {
          rule: 'description',
          severity: 'warning',
          field: 'description',
          message: `Description is only ${manifest.description.length} chars — aim for at least 10`,
          suggestion: 'Expand the description to better explain the plugin',
        },
      ];
    }
    return [];
  },
};

const licenseRule: LintRule = {
  id: 'license',
  description: 'Plugin should declare a license',
  run: ({ manifest }) => {
    if (!manifest.license) {
      return [
        {
          rule: 'license',
          severity: 'warning',
          field: 'license',
          message: 'License is missing — declare one for redistribution clarity',
          suggestion: 'Common choices: MIT, Apache-2.0, ISC',
        },
      ];
    }
    return [];
  },
};

const targetHygieneRule: LintRule = {
  id: 'target-hygiene',
  description: 'Declared targets should have reachable hooks',
  run: ({ manifest }) => {
    const targets = manifest.targets;
    const hasHooks =
      !!manifest.hooks && Object.keys(manifest.hooks).length > 0;
    if (targets && targets.length > 0 && !hasHooks) {
      return [
        {
          rule: 'target-hygiene',
          severity: 'warning',
          field: 'targets',
          message: `Targets [${targets.join(', ')}] are declared but no hooks are defined — the plugin will have no behavior on those platforms`,
          suggestion: 'Add hooks or remove unused targets',
        },
      ];
    }
    return [];
  },
};

const hookCoverageRule: LintRule = {
  id: 'hook-coverage',
  description: 'Plugins that declare tools should guard them with a preToolUse hook',
  run: ({ manifest }) => {
    const hasTools = !!manifest.tools && manifest.tools.length > 0;
    const hasPreToolUse = !!manifest.hooks?.preToolUse;
    if (hasTools && !hasPreToolUse) {
      return [
        {
          rule: 'hook-coverage',
          severity: 'warning',
          field: 'hooks.preToolUse',
          message:
            'Plugin declares tools but no preToolUse hook — tool calls will not be guarded',
          suggestion:
            'Add a preToolUse hook to validate or gate tool invocations',
        },
      ];
    }
    return [];
  },
};

const handlerSafetyRule: LintRule = {
  id: 'handler-safety',
  description: 'Handler source (inline and command) must not contain dangerous patterns',
  run: ({ manifest, inlineHandlerSource }) => {
    const hasSubprocessCapability = manifest.capabilities?.includes('subprocess') ?? false;
    const activePatterns = hasSubprocessCapability
      ? ALWAYS_BLOCKED_PATTERNS
      : SAFETY_PATTERNS;

    const issues: LintIssue[] = [];

    // Scan inline handler source strings
    if (inlineHandlerSource) {
      for (const source of inlineHandlerSource) {
        for (const pattern of activePatterns) {
          const match = pattern.exec(source);
          if (match) {
            issues.push({
              rule: 'handler-safety',
              severity: 'error',
              field: 'hooks.<handler>',
              message: `Handler source contains dangerous pattern "${match[0]}"`,
              suggestion: SUBPROCESS_PATTERNS.some((p) => p.test(match[0]))
                ? 'Declare capabilities: [\'subprocess\'] in your manifest and use spawnChild() from @agentplugins/core'
                : 'Remove or sandbox the dangerous code',
            });
          }
        }
      }
    }

    // Scan command-handler command strings
    if (manifest.hooks) {
      for (const [name, def] of Object.entries(manifest.hooks)) {
        if (def && def.handler.type === 'command') {
          for (const pattern of activePatterns) {
            const match = pattern.exec(def.handler.command);
            if (match) {
              issues.push({
                rule: 'handler-safety',
                severity: 'error',
                field: `hooks.${name}`,
                message: `Handler source contains dangerous pattern "${match[0]}"`,
                suggestion: SUBPROCESS_PATTERNS.some((p) => p.test(match[0]))
                  ? 'Declare capabilities: [\'subprocess\'] in your manifest and use spawnChild() from @agentplugins/core'
                  : 'Remove or sandbox the dangerous code',
              });
            }
          }
        }
      }
    }

    return issues;
  },
};

const secretsRule: LintRule = {
  id: 'secrets',
  description: 'Handler source and commands must not contain accidental secrets',
  run: ({ manifest, inlineHandlerSource }) => {
    const haystacks: { field: string; text: string }[] = [];
    if (inlineHandlerSource) {
      for (const src of inlineHandlerSource) {
        haystacks.push({ field: 'hooks.<handler>', text: src });
      }
    }
    if (manifest.hooks) {
      for (const [name, def] of Object.entries(manifest.hooks)) {
        if (def && def.handler.type === 'command') {
          haystacks.push({ field: `hooks.${name}`, text: def.handler.command });
        }
      }
    }
    const issues: LintIssue[] = [];
    for (const { field, text } of haystacks) {
      for (const pattern of SECRET_PATTERNS) {
        const match = pattern.exec(text);
        if (match) {
          issues.push({
            rule: 'secrets',
            severity: 'error',
            field,
            message: 'Possible secret or API token detected in handler source',
            suggestion: 'Move secrets to environment variables or user config',
          });
        }
      }
    }
    return issues;
  },
};

const continueWithSafetyRule: LintRule = {
  id: 'continuewith-safety',
  description: 'Plugins using continueWith on the stop hook should declare an exit-condition tool',
  run: ({ manifest, inlineHandlerSource }) => {
    const hasStopHook = !!manifest.hooks?.stop;
    if (!hasStopHook) return [];

    const handler = manifest.hooks?.stop?.handler;
    // Detect continueWith usage: in command handler text OR in inline handler source
    const usesContinueWith =
      (handler?.type === 'command' && handler.command.includes('continueWith')) ||
      (inlineHandlerSource?.some((s) => s.includes('continueWith')) ?? false);

    if (!usesContinueWith) return [];

    const hasTools = !!manifest.tools && manifest.tools.length > 0;
    if (!hasTools) {
      return [{
        rule: 'continuewith-safety',
        severity: 'warning',
        field: 'hooks.stop',
        message: 'stop hook appears to use continueWith but no exit-condition tools are declared — this can cause runaway loops',
        suggestion: 'Add a tool (e.g. goal_complete) that the agent calls to halt the loop',
      }];
    }
    return [];
  },
};

export const BUILTIN_LINT_RULES: LintRule[] = [
  namingRule,
  versioningRule,
  descriptionRule,
  licenseRule,
  targetHygieneRule,
  hookCoverageRule,
  handlerSafetyRule,
  secretsRule,
  continueWithSafetyRule,
];

let registry: LintRule[] = [...BUILTIN_LINT_RULES];

export function registerLintRule(rule: LintRule): void {
  registry.push(rule);
}

export function getLintRules(): LintRule[] {
  return registry;
}

export function lint(ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const rule of registry) {
    issues.push(...rule.run(ctx));
  }
  return issues;
}

export function lintManifest(manifest: PluginManifest): LintIssue[] {
  return lint({ manifest });
}
