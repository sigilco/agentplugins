import type {
  PluginManifest,
  PlatformAdapter,
  FileOutput,
  NativeCopy,
  ValidationIssue,
} from '@agentplugins/contract';

// ─── Opaque extension interfaces ─────────────────────────────────────────────
// Kept structurally compatible with @agentplugins/compile exports.

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

export interface CodeEmitter {
  readonly language: string;
  emit(manifest: PluginManifest, hooks: unknown[]): FileOutput[];
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export type Next = () => Promise<void>;
export type Middleware<Ctx> = (ctx: Ctx, next: Next) => Promise<void>;

// ─── Contexts ─────────────────────────────────────────────────────────────────

export interface BuildCtx {
  manifest: PluginManifest;
  targets: string[];
  outDir?: string;
  pluginRoot?: string;
  issues: ValidationIssue[];
  warnings: string[];
  /** Accumulated output files per target. */
  files: Map<string, FileOutput[]>;
  nativeCopies: Map<string, NativeCopy[]>;
  postInstall: Map<string, string[]>;
  abort(reason?: string): never;
  addIssue(issue: ValidationIssue): void;
  addWarning(message: string): void;
  addFile(target: string, file: FileOutput): void;
  addNativeCopy(target: string, copy: NativeCopy): void;
  addPostInstall(target: string, step: string): void;
}

export interface TargetCtx {
  manifest: PluginManifest;
  target: string;
  pluginRoot?: string;
  files: FileOutput[];
  warnings: string[];
  nativeCopies: NativeCopy[];
  postInstall: string[];
  abort(reason?: string): never;
  addFile(file: FileOutput): void;
  addWarning(message: string): void;
  addNativeCopy(copy: NativeCopy): void;
  addPostInstall(step: string): void;
}

export interface InstallCtx {
  pluginName: string;
  installDir: string;
  manifest: PluginManifest;
  meta: Record<string, unknown>;
  abort(reason?: string): never;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export interface Plugin {
  readonly name: string;
  /** Contributes a compile target. */
  adapter?: PlatformAdapter;
  /** Contributes build-time checks. */
  lintRules?: LintRule[];
  /** Contributes code emitters. */
  emitters?: Record<string, CodeEmitter>;
  // Build-side lifecycle
  preValidate?: Middleware<BuildCtx>;
  transformIR?: Middleware<BuildCtx>;
  postEmit?: Middleware<TargetCtx>;
  // Install-side lifecycle
  onAudit?: Middleware<InstallCtx>;
  onInstall?: Middleware<InstallCtx>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export interface App {
  use(plugin: Plugin): App;
  /** Registered adapters, keyed by target name. */
  readonly adapters: ReadonlyMap<string, PlatformAdapter>;
  /** All registered lint rules from plugins. */
  readonly lintRules: readonly LintRule[];
  /** All registered emitters from plugins. */
  readonly emitters: ReadonlyMap<string, CodeEmitter>;
  runBuild(ctx: BuildCtx): Promise<void>;
  runInstall(ctx: InstallCtx): Promise<void>;
}
