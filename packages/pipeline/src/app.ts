import type {
  Plugin,
  App,
  Middleware,
  BuildCtx,
  TargetCtx,
  InstallCtx,
  LintRule,
  CodeEmitter,
} from './types.js';
import type { PlatformAdapter } from '@agentplugins/contract';

export class AbortError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Pipeline aborted');
    this.name = 'AbortError';
  }
}

async function runChain<Ctx>(
  chain: Middleware<Ctx>[],
  ctx: Ctx
): Promise<void> {
  let i = 0;
  const next = async (): Promise<void> => {
    if (i < chain.length) {
      await chain[i++](ctx, next);
    }
  };
  await next();
}

class PipelineApp implements App {
  private readonly plugins: Plugin[] = [];
  private readonly _adapters = new Map<string, PlatformAdapter>();
  private readonly _lintRules: LintRule[] = [];
  private readonly _emitters = new Map<string, CodeEmitter>();

  get adapters(): ReadonlyMap<string, PlatformAdapter> {
    return this._adapters;
  }

  get lintRules(): readonly LintRule[] {
    return this._lintRules;
  }

  get emitters(): ReadonlyMap<string, CodeEmitter> {
    return this._emitters;
  }

  use(plugin: Plugin): App {
    this.plugins.push(plugin);

    if (plugin.adapter) {
      this._adapters.set(plugin.adapter.name, plugin.adapter);
    }

    if (plugin.lintRules) {
      this._lintRules.push(...plugin.lintRules);
    }

    if (plugin.emitters) {
      for (const [lang, emitter] of Object.entries(plugin.emitters)) {
        this._emitters.set(lang, emitter);
      }
    }

    return this;
  }

  async runBuild(ctx: BuildCtx): Promise<void> {
    const preValidateChain = this.plugins
      .map(p => p.preValidate)
      .filter((m): m is Middleware<BuildCtx> => m != null);

    const transformIRChain = this.plugins
      .map(p => p.transformIR)
      .filter((m): m is Middleware<BuildCtx> => m != null);

    try {
      await runChain(preValidateChain, ctx);
      await runChain(transformIRChain, ctx);
    } catch (err) {
      if (err instanceof AbortError) throw err;
      throw err;
    }
  }

  async runTarget(ctx: TargetCtx): Promise<void> {
    const postEmitChain = this.plugins
      .map(p => p.postEmit)
      .filter((m): m is Middleware<TargetCtx> => m != null);

    try {
      await runChain(postEmitChain, ctx);
    } catch (err) {
      if (err instanceof AbortError) throw err;
      throw err;
    }
  }

  async runInstall(ctx: InstallCtx): Promise<void> {
    const onInstallChain = this.plugins
      .map(p => p.onInstall)
      .filter((m): m is Middleware<InstallCtx> => m != null);

    try {
      await runChain(onInstallChain, ctx);
    } catch (err) {
      if (err instanceof AbortError) throw err;
      throw err;
    }
  }

  async runAudit(ctx: InstallCtx): Promise<void> {
    const onAuditChain = this.plugins
      .map(p => p.onAudit)
      .filter((m): m is Middleware<InstallCtx> => m != null);

    await runChain(onAuditChain, ctx);
  }
}

export function createApp(): PipelineApp {
  return new PipelineApp();
}

// ─── Context factories ────────────────────────────────────────────────────────

import type {
  PluginManifest,
  FileOutput,
  NativeCopy,
  ValidationIssue,
} from '@agentplugins/contract';

export function createBuildCtx(options: {
  manifest: PluginManifest;
  targets: string[];
  outDir?: string;
  pluginRoot?: string;
}): BuildCtx {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  const files = new Map<string, FileOutput[]>();
  const nativeCopies = new Map<string, NativeCopy[]>();
  const postInstall = new Map<string, string[]>();

  const abort = (reason?: string): never => {
    throw new AbortError(reason);
  };

  return {
    manifest: options.manifest,
    targets: options.targets,
    outDir: options.outDir,
    pluginRoot: options.pluginRoot,
    issues,
    warnings,
    files,
    nativeCopies,
    postInstall,
    abort,
    addIssue(issue) { issues.push(issue); },
    addWarning(msg) { warnings.push(msg); },
    addFile(target, file) {
      const list = files.get(target) ?? [];
      list.push(file);
      files.set(target, list);
    },
    addNativeCopy(target, copy) {
      const list = nativeCopies.get(target) ?? [];
      list.push(copy);
      nativeCopies.set(target, list);
    },
    addPostInstall(target, step) {
      const list = postInstall.get(target) ?? [];
      list.push(step);
      postInstall.set(target, list);
    },
  };
}

export function createTargetCtx(options: {
  manifest: PluginManifest;
  target: string;
  pluginRoot?: string;
}): TargetCtx {
  const files: FileOutput[] = [];
  const warnings: string[] = [];
  const nativeCopies: NativeCopy[] = [];
  const postInstall: string[] = [];

  const abort = (reason?: string): never => {
    throw new AbortError(reason);
  };

  return {
    manifest: options.manifest,
    target: options.target,
    pluginRoot: options.pluginRoot,
    files,
    warnings,
    nativeCopies,
    postInstall,
    abort,
    addFile(file) { files.push(file); },
    addWarning(msg) { warnings.push(msg); },
    addNativeCopy(copy) { nativeCopies.push(copy); },
    addPostInstall(step) { postInstall.push(step); },
  };
}

export function createInstallCtx(options: {
  pluginName: string;
  installDir: string;
  manifest: PluginManifest;
  meta?: Record<string, unknown>;
}): InstallCtx {
  const abort = (reason?: string): never => {
    throw new AbortError(reason);
  };

  return {
    pluginName: options.pluginName,
    installDir: options.installDir,
    manifest: options.manifest,
    meta: options.meta ?? {},
    abort,
  };
}
