/**
 * @agentplugin/adapter-gemini
 *
 * Platform adapter for the Google Gemini CLI extension system.
 * Generates `gemini-extension.json` manifests and the `hooks/hooks.json`
 * command-map with JSON stdin/stdout protocol wrappers.
 *
 * ## Exit-code contract
 * - 0 → success / allow
 * - 2 → block / reject
 * - any other → warning (logged but not blocking)
 *
 * ## Variable substitution
 * `${extensionPath}`  → absolute path to the extension root
 * `${workspacePath}`  → absolute path to the current workspace
 * `${/}`              → platform-specific path separator
 *
 * ## Settings / env-var sanitization
 * Settings are declared in the manifest with `envVar` names.
 * Sensitive values are redacted from logs.
 */

import {
  type PlatformAdapter,
  type PluginManifest,
  type ValidationIssue,
  type AdapterOutput,
  type AdapterFile,
  type TargetPlatform,
  type UniversalHookName,
  type HandlerType,
  Severity,
} from "@agentplugin/core";

/* ───────────────────── Gemini-specific types ───────────────────── */

/** Manifest shape required by the Gemini CLI (gemini-extension.json). */
interface GeminiExtensionManifest {
  /** Kebab-case extension identifier. */
  name: string;
  /** SemVer version string. */
  version: string;
  description?: string;
  mcpServers?: unknown[];
  contextFileName?: string;
  excludeTools?: string[];
  plan?: string;
  /** Ralph looping plan (AfterAgent hook only). */
  settings?: GeminiSetting[];
  themes?: unknown[];
}

/** A single user-configurable setting exposed in the manifest. */
interface GeminiSetting {
  name: string;
  description: string;
  envVar: string;
  /** If true the value is redacted in logs. */
  sensitive?: boolean;
}

/** Hook command entry inside hooks/hooks.json. */
interface HookCommand {
  /** Shell command to execute (already includes variable substitution). */
  command: string;
  /** Optional working directory override. */
  cwd?: string;
  /** Key of the setting whose envVar should be injected. */
  settingEnvVar?: string;
}

/** Top-level hooks.json map: lifecycleEvent → HookCommand[]. */
interface HooksJson {
  [lifecycleEvent: string]: HookCommand[];
}

/** The 10 Gemini lifecycle events (alphabetical order for stable output). */
const GEMINI_LIFECYCLE_EVENTS: readonly string[] = [
  "AfterAgent",
  "AfterModel",
  "AfterTool",
  "BeforeAgent",
  "BeforeModel",
  "BeforeTool",
  "BeforeToolSelection",
  "Notification",
  "PreCompress",
  "SessionEnd",
  "SessionStart",
];

/** Mapping from universal hook name → Gemini lifecycle event name. */
const UNIVERSAL_TO_GEMINI: Readonly<
  Record<string, string | undefined>
> = {
  sessionStart: "SessionStart",
  preToolUse: "BeforeTool", // BeforeTool can block (exit 2); BeforeToolSelection cannot
  postToolUse: "AfterTool",
  userPromptSubmit: "BeforeAgent",
  subagentStart: "BeforeAgent", // no direct equivalent — closest match
  preCompact: "PreCompress",
  sessionEnd: "SessionEnd",
  notification: "Notification",
};

/** Hooks that Gemini does **not** support natively. */
const UNSUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "userPromptExpansion",
  "permissionRequest",
  "permissionDenied",
  "postToolUseFailure",
  "postCompact",
  "stop",
  "stopFailure",
  "fileChanged",
  "cwdChanged",
  "setup",
];

/* ───────────────────── Validation helpers ───────────────────── */

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Return validation issues for a raw plugin manifest. */
function validateGeminiManifest(plugin: PluginManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  /* ---- required fields ---- */
  if (!plugin.name) {
    issues.push({
      severity: Severity.ERROR,
      message: "Gemini manifest requires 'name' (kebab-case).",
    });
  } else if (!KEBAB_RE.test(plugin.name)) {
    issues.push({
      severity: Severity.ERROR,
      message: `Gemini extension name must be kebab-case (got "${plugin.name}").`,
    });
  }

  if (!plugin.version) {
    issues.push({
      severity: Severity.ERROR,
      message: "Gemini manifest requires 'version' (SemVer).",
    });
  } else if (!SEMVER_RE.test(plugin.version)) {
    issues.push({
      severity: Severity.ERROR,
      message: `Gemini extension version must be SemVer (got "${plugin.version}").`,
    });
  }

  const hooks = plugin.hooks ? Object.values(plugin.hooks).filter(Boolean) : [];

  /* ---- hook compatibility ---- */
  for (const hook of hooks) {
    if (UNSUPPORTED_HOOKS.includes(hook.hookName as UniversalHookName)) {
      issues.push({
        severity: Severity.WARNING,
        message: `Hook "${hook.hookName}" is not supported by Gemini CLI and will be ignored.`,
      });
    }
    if (!UNIVERSAL_TO_GEMINI[hook.hookName]) {
      issues.push({
        severity: Severity.WARNING,
        message: `Hook "${hook.hookName}" has no Gemini equivalent and will be skipped.`,
      });
    }
  }

  /* ---- handler type compatibility ---- */
  for (const hook of hooks) {
    if (hook.handlerType === "file") {
      issues.push({
        severity: Severity.WARNING,
        message:
          'Gemini CLI prefers inline handlers; "file" handlers are wrapped in temporary scripts.',
      });
    }
  }

  /* ---- settings / envVar sanity ---- */
  for (const setting of plugin.settings ?? []) {
    const ev = `${plugin.name.toUpperCase()}_${setting.title.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    if (!/^[A-Z_][A-Z0-9_]*$/.test(ev)) {
      issues.push({
        severity: Severity.WARNING,
        message: `Setting "${setting.title}" envVar "${ev}" does not follow UPPER_SNAKE_CASE convention.`,
      });
    }
    if (ev.startsWith("GEMINI_")) {
      issues.push({
        severity: Severity.WARNING,
        message: `Setting "${setting.title}" envVar "${ev}" may collide with Gemini reserved variables.`,
      });
    }
  }

  return issues;
}

/* ───────────────────── Compilation helpers ───────────────────── */

/**
 * Wrap an inline handler script in a Node.js shebang script that
 * speaks the Gemini JSON stdin/stdout protocol.
 *
 * Gemini expects:
 *   stdin  → JSON event payload
 *   stdout → JSON result (optional)
 *   exit   → 0 (allow), 2 (block), other (warning)
 */
function wrapInlineHandler(
  script: string,
  hookName: string,
  geminiEvent: string
): string {
  const cleanScript = script.trim();
  const isNode =
    cleanScript.startsWith("#!/usr/bin/env node") ||
    cleanScript.startsWith("#!/usr/bin/node");

  if (isNode) {
    /* Already a Node script — inject protocol helpers at the top */
    return `${cleanScript}`;
  }

  /* Default wrapper: spawn the script and translate its exit code */
  return `#!/usr/bin/env node
// Auto-generated Gemini hook wrapper for "${hookName}" → ${geminiEvent}
// ${new Date().toISOString()}

const { spawn } = require("child_process");
const path = require("path");

// Accumulate stdin JSON payload
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let payload = {};
  try { payload = JSON.parse(input); } catch { /* ignore malformed stdin */ }

  const child = spawn(process.execPath, [__filename + ".impl.js"], {
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, GEMINI_HOOK_PAYLOAD: JSON.stringify(payload) },
  });

  child.stdin.write(input);
  child.stdin.end();

  child.on("exit", (code) => {
    // Gemini exit-code contract
    if (code === 0) process.exit(0);               // allow
    if (code === 2) process.exit(2);                // block
    process.exit(1);                                // warning
  });
});
`;
}

/**
 * Wrap a file-based handler so it conforms to the Gemini protocol.
 * Returns a *new* inline script that proxies to the file.
 */
function wrapFileHandler(filePath: string): string {
  return `#!/usr/bin/env node
// Auto-generated Gemini file-handler proxy
const { spawn } = require("child_process");
const path = require("path");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, "${filePath.replace(
    /"/g,
    '\\"'
  )}")], {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  });
  child.stdin.write(input);
  child.stdin.end();
  child.on("exit", (code) => {
    if (code === 0) process.exit(0);
    if (code === 2) process.exit(2);
    process.exit(1);
  });
});
`;
}

/**
 * Substitute AgentBridge variables with Gemini equivalents:
 * - ${extensionPath} → ${extensionPath}  (same name, kept as-is)
 * - ${workspacePath} → ${workspacePath}  (same name, kept as-is)
 * - ${/}             → ${/}              (same name, kept as-is)
 *
 * Gemini natively supports these three placeholders, so we pass them
 * through unchanged.
 */
function substituteVariables(cmd: string): string {
  return cmd;
}

/**
 * Sanitize an environment-variable name so it is safe for Gemini.
 * - Must be UPPER_SNAKE_CASE
 * - Must not collide with reserved GEMINI_ prefixes
 */
function sanitizeEnvVar(name: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "_")
    .toUpperCase();

  if (sanitized.startsWith("GEMINI_")) {
    return "EXT_" + sanitized.substring(7);
  }
  return sanitized;
}

/* ───────────────────── Adapter implementation ───────────────────── */

export class GeminiAdapter implements PlatformAdapter {
  readonly name: TargetPlatform = "gemini";
  readonly displayName = "Google Gemini CLI";

  readonly supportedHooks: readonly UniversalHookName[] = [
    "sessionStart",
    "preToolUse",
    "postToolUse",
    "userPromptSubmit",
    "subagentStart",
    "preCompact",
    "sessionEnd",
    "notification",
  ];

  readonly supportedHandlers: readonly HandlerType[] = ["inline", "file"];

  readonly manifestPath = "gemini-extension.json";
  readonly manifestFormat = "json" as const;

  validate(plugin: PluginManifest): ValidationIssue[] {
    return validateGeminiManifest(plugin);
  }

  compile(plugin: PluginManifest): AdapterOutput {
    const issues = this.validate(plugin);
    const files: AdapterFile[] = [];
    const hooks = plugin.hooks ? Object.values(plugin.hooks).filter(Boolean) : [];

    /* ---- 1. gemini-extension.json ---- */
    const geminiManifest: GeminiExtensionManifest = {
      name: plugin.name,
      version: plugin.version,
    };

    if (plugin.description) {
      geminiManifest.description = plugin.description;
    }

    const meta = plugin.metadata ?? {};
    if (meta.mcpServers) geminiManifest.mcpServers = meta.mcpServers as unknown[];
    if (meta.contextFileName) geminiManifest.contextFileName = meta.contextFileName as string;
    if (meta.excludeTools) geminiManifest.excludeTools = meta.excludeTools as string[];
    if (meta.plan) geminiManifest.plan = meta.plan as string;
    if (meta.themes) geminiManifest.themes = meta.themes as unknown[];

    if (plugin.settings && plugin.settings.length > 0) {
      geminiManifest.settings = plugin.settings.map((s) => ({
        name: s.title,
        description: s.description ?? "",
        envVar: sanitizeEnvVar(`${plugin.name.toUpperCase()}_${s.title.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`),
        sensitive: s.sensitive === true,
      }));
    }

    files.push({
      path: this.manifestPath,
      content: JSON.stringify(geminiManifest, null, 2),
    });

    /* ---- 2. hooks/hooks.json + hook scripts ---- */
    const hooksJson: HooksJson = {};

    for (const event of GEMINI_LIFECYCLE_EVENTS) {
      hooksJson[event] = [];
    }

    for (const hook of hooks) {
      const geminiEvent = UNIVERSAL_TO_GEMINI[hook.hookName];
      if (!geminiEvent) continue;

      const hookFileName = `hook-${hook.hookName}.js`;
      const hookFilePath = `hooks/${hookFileName}`;

      let scriptContent: string;
      if (hook.handlerType === "file" && hook.script) {
        scriptContent = wrapFileHandler(hook.script);
      } else {
        // inline handler
        scriptContent = wrapInlineHandler(
          hook.script ?? "// no-op",
          hook.hookName,
          geminiEvent
        );
      }

      // Add the actual implementation file for inline handlers too
      if (hook.handlerType !== "file") {
        files.push({
          path: hookFilePath,
          content: hook.script ?? "// no-op",
        });
      }

      // For file handlers, the script references the user's file — no separate copy

      const command = `node \${extensionPath}/${hookFilePath}`;

      hooksJson[geminiEvent].push({
        command: substituteVariables(command),
        ...(hook.cwd ? { cwd: hook.cwd } : {}),
        ...(hook.settingRef
          ? { settingEnvVar: sanitizeEnvVar(hook.settingRef) }
          : {}),
      });

      // Ralph extension hooks pattern: AfterAgent looping
      if (geminiEvent === "AfterAgent" && hook.metadata?.ralphLoop) {
        hooksJson["AfterAgent"].push({
          command: substituteVariables(
            `node \${extensionPath}/${hookFilePath} --ralph-loop`
          ),
          ...(hook.cwd ? { cwd: hook.cwd } : {}),
        });
      }
    }

    // Remove lifecycle events that have no commands
    for (const event of GEMINI_LIFECYCLE_EVENTS) {
      if (hooksJson[event].length === 0) {
        delete hooksJson[event];
      }
    }

    files.push({
      path: "hooks/hooks.json",
      content: JSON.stringify(hooksJson, null, 2),
    });

    /* ---- 3. README stub (optional but helpful) ---- */
    files.push({
      path: "README.md",
      content: `# ${plugin.name} — Gemini Extension

Generated by AgentBridge for the Google Gemini CLI platform.

## Install

Place this folder in your Gemini extensions directory and reload.

## Settings

${(geminiManifest.settings ?? [])
  .map((s) => `- \`${s.envVar}\` — ${s.description}${s.sensitive ? " (sensitive)" : ""}`)
  .join("\n") || "_No settings configured._"}

## Hooks

| Universal Hook | Gemini Event | Command |
|---------------|--------------|---------|
${Object.values(plugin.hooks ?? {})
  .filter((h): h is NonNullable<typeof h> => h !== undefined && 'hookName' in h)
  .filter((h) => UNIVERSAL_TO_GEMINI[h.hookName])
  .map((h) => `| \`${h.hookName}\` | \`${UNIVERSAL_TO_GEMINI[h.hookName]}\` | \`node hooks/hook-${h.hookName}.js\` |`)
  .join("\n") || "_No hooks configured._"}

## Exit-code contract

- \`0\` — success / allow
- \`2\` — block / reject
- other — warning (logged, not blocking)
`,
    });

    return { files, manifest: geminiManifest as unknown as Record<string, unknown>, warnings: [], issues };
  }
}

/** Singleton adapter instance. */
export const geminiAdapter = new GeminiAdapter();

/** Factory function for creating a new Gemini adapter instance. */
export function createGeminiAdapter(): PlatformAdapter {
  return new GeminiAdapter();
}

export default geminiAdapter;
