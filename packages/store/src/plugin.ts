/**
 * Built-in security Plugin for the install pipeline.
 *
 * Wraps evaluateScriptPolicy (via gateSetupCommand) and integrity checking
 * as explicit, reorderable middleware. Registered by default in the install
 * pipeline — power users may remove or reorder it via defineConfig.
 */

import type { Plugin, InstallCtx } from '@agentplugins/pipeline';
import { hashDirectory, evaluateScriptPolicy, DEFAULT_POLICY } from '@agentplugins/security';
import { resolveSetupCommand, gateSetupCommand } from './setup.js';

/** Abort keys written to InstallCtx.meta by securityPlugin middleware. */
export const SECURITY_META_KEYS = {
  integrity: 'security:integrity',
  scriptDecision: 'security:scriptDecision',
} as const;

/**
 * Middleware: hashes the install directory and stores the result in ctx.meta.
 * Does not abort — callers may inspect ctx.meta[SECURITY_META_KEYS.integrity]
 * to decide whether to block.
 */
async function integrityMiddleware(ctx: InstallCtx, next: () => Promise<void>): Promise<void> {
  if (ctx.installDir) {
    const hash = hashDirectory(ctx.installDir);
    ctx.meta[SECURITY_META_KEYS.integrity] = hash;
  }
  await next();
}

/**
 * Middleware: evaluates the setup-script policy for the plugin's setup command.
 * Aborts the install if the policy returns 'deny'.
 */
async function scriptPolicyMiddleware(ctx: InstallCtx, next: () => Promise<void>): Promise<void> {
  const manifest = ctx.manifest as unknown as Record<string, unknown>;
  const resolved = resolveSetupCommand(ctx.installDir, manifest);

  if (resolved) {
    const gate = gateSetupCommand(resolved.command, ctx.pluginName);
    ctx.meta[SECURITY_META_KEYS.scriptDecision] = gate;

    if (gate.decision === 'deny') {
      ctx.abort(
        `Setup command blocked by policy for "${ctx.pluginName}": ${gate.reasons.join('; ')}`
      );
    }
  }

  await next();
}

/**
 * Middleware: evaluates script policy for all dependency lifecycle commands
 * declared in the manifest. Aborts if any are denied.
 */
async function dependencyScriptMiddleware(ctx: InstallCtx, next: () => Promise<void>): Promise<void> {
  const manifest = ctx.manifest as unknown as Record<string, unknown>;
  const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies as Array<Record<string, unknown>> : [];

  for (const dep of deps) {
    if (typeof dep.lifecycle === 'string' && typeof dep.command === 'string') {
      const result = evaluateScriptPolicy(
        {
          dependency: String(dep.name ?? '?'),
          phase: dep.lifecycle as 'preinstall' | 'install' | 'postinstall',
          command: dep.command,
          pluginName: ctx.pluginName,
        },
        DEFAULT_POLICY,
      );

      if (result.decision === 'deny') {
        ctx.abort(
          `Dependency lifecycle script blocked by policy: ${dep.name} (${dep.lifecycle}): ${result.reasons.join('; ')}`
        );
      }
    }
  }

  await next();
}

/**
 * Built-in security plugin. Provides three onInstall middleware stages:
 *  1. integrityMiddleware — hashes the install dir
 *  2. scriptPolicyMiddleware — gates the plugin's own setup command
 *  3. dependencyScriptMiddleware — gates dependency lifecycle scripts
 *
 * All three abort (throw AbortError) on a denied decision.
 */
export const securityPlugin: Plugin = {
  name: '@agentplugins/security-gate',

  onInstall: async (ctx, next) => {
    await integrityMiddleware(ctx, async () => {
      await scriptPolicyMiddleware(ctx, async () => {
        await dependencyScriptMiddleware(ctx, next);
      });
    });
  },
};
