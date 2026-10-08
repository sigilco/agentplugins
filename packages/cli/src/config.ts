/**
 * `~/.agents/harness/config.toml` — namespaced config per store-layout.md
 * §5.5. Two owned prefixes exist today:
 *
 *   [policy]          trust.md §4.1 — exec/script policy + source allowlists
 *   [[serve.caller]]  bridge/transports.md §3 — per-caller op scoping
 *
 * TOML is parsed by a deliberately small hand-rolled subset reader — no
 * parser dep in the scriptc island. Supported: `[table]`,
 * `[[array-of-tables]]`, `key = "string" | true | false | <int> | ["a",…]`,
 * `#` comments, dotted keys are NOT supported (nothing we own needs them).
 */
import { CliError } from "./errors.js";

export type TomlValue = string | number | boolean | string[];
export interface TomlTable {
  [key: string]: TomlValue | TomlTable | TomlTable[];
}

const parseScalar = (raw: string): string | number | boolean => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1);
  }
  throw new CliError("config-invalid", `unsupported TOML value: ${raw}`);
};

const parseValue = (raw: string): TomlValue => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    if (!trimmed.endsWith("]")) {
      throw new CliError("config-invalid", `unterminated array: ${raw}`);
    }
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => {
      const v = parseScalar(item.trim());
      if (typeof v !== "string") {
        throw new CliError(
          "config-invalid",
          `arrays support string members only: ${raw}`,
        );
      }
      return v;
    });
  }
  return parseScalar(trimmed);
};

/** Strip a `#` comment that is not inside quotes. */
const stripComment = (line: string): string => {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && !inSingle && line[i - 1] !== "\\") inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "#" && !inDouble && !inSingle) return line.slice(0, i);
  }
  return line;
};

export const parseToml = (text: string): TomlTable => {
  const root: TomlTable = {};
  // Cursor to the table that bare `key = value` lines currently write into.
  let cursor = root;

  text.split("\n").forEach((rawLine, idx) => {
    const line = stripComment(rawLine).trim();
    if (line === "") return;

    const arrayTable = line.match(/^\[\[([\w.-]+)\]\]$/);
    const table = line.match(/^\[([\w.-]+)\]$/);
    if (arrayTable) {
      const path = arrayTable[1].split(".");
      const parent = dig(root, path.slice(0, -1), idx);
      const key = path[path.length - 1];
      const existing = parent[key];
      const list: TomlTable[] = Array.isArray(existing)
        ? existing.filter(
            (e): e is TomlTable => typeof e === "object" && e !== null,
          )
        : [];
      const entry: TomlTable = {};
      list.push(entry);
      parent[key] = list;
      cursor = entry;
      return;
    }
    if (table) {
      cursor = dig(root, table[1].split("."), idx);
      return;
    }

    const eq = line.indexOf("=");
    if (eq === -1) {
      throw new CliError(
        "config-invalid",
        `config.toml line ${idx + 1}: expected key = value`,
      );
    }
    const key = line.slice(0, eq).trim();
    if (key === "") {
      throw new CliError(
        "config-invalid",
        `config.toml line ${idx + 1}: empty key`,
      );
    }
    cursor[key] = parseValue(line.slice(eq + 1));
  });

  return root;
};

const dig = (root: TomlTable, path: string[], line: number): TomlTable => {
  let cursor = root;
  for (const segment of path) {
    const next = cursor[segment];
    if (next === undefined) {
      const created: TomlTable = {};
      cursor[segment] = created;
      cursor = created;
    } else if (typeof next === "object" && !Array.isArray(next)) {
      cursor = next;
    } else {
      throw new CliError(
        "config-invalid",
        `config.toml line ${line + 1}: [${path.join(".")}] conflicts with a value`,
      );
    }
  }
  return cursor;
};

/* ── Typed views over the two owned tables ──────────────────────────── */

export type PolicyValue = "deny" | "ask" | "allow";

export interface Policy {
  execSetup: PolicyValue;
  execHooks: PolicyValue;
  execMcp: PolicyValue;
  execSkillScripts: PolicyValue;
  /** What `ask` resolves to with no human to answer (trust.md §4.1). */
  execNonInteractive: "deny" | "allow";
  sourcesAllow: string[];
  sourcesDeny: string[];
}

/** Spec-required shipped defaults (trust.md §4.1). */
export const defaultPolicy = (): Policy => ({
  execSetup: "ask",
  execHooks: "ask",
  execMcp: "ask",
  execSkillScripts: "ask",
  execNonInteractive: "deny",
  sourcesAllow: [],
  sourcesDeny: [],
});

export interface ServeCaller {
  name: string;
  /** Bearer credential; stored hashed per transports.md §3.1. */
  token?: string;
  /** Method allowlist; absent = full op set. */
  allow?: string[];
  deny?: string[];
}

const policyValue = (raw: TomlValue | undefined, key: string): PolicyValue => {
  if (raw === undefined) return "ask";
  if (raw === "deny" || raw === "ask" || raw === "allow") return raw;
  throw new CliError(
    "config-invalid",
    `[policy] ${key} must be deny | ask | allow, got ${JSON.stringify(raw)}`,
  );
};

const stringList = (raw: TomlValue | undefined, key: string): string[] => {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  throw new CliError(
    "config-invalid",
    `${key} must be an array of strings`,
  );
};

export const policyFromToml = (root: TomlTable): Policy => {
  const table = root.policy;
  const policy = defaultPolicy();
  if (table === undefined) return policy;
  if (typeof table !== "object" || Array.isArray(table)) {
    throw new CliError("config-invalid", "[policy] must be a table");
  }
  const exec =
    typeof table.exec === "object" && !Array.isArray(table.exec)
      ? table.exec
      : undefined;
  const sources =
    typeof table.sources === "object" && !Array.isArray(table.sources)
      ? table.sources
      : undefined;

  // Accept both `[policy.exec]` sub-tables and `exec.setup`-style flat keys
  // flattened by hand (our subset parser keeps them distinct anyway).
  const execVal = (key: string): TomlValue | undefined => {
    const flat = table[`exec.${key}`];
    return exec?.[key] !== undefined
      ? (exec[key] as TomlValue)
      : (flat as TomlValue | undefined);
  };

  policy.execSetup = policyValue(execVal("setup"), "exec.setup");
  policy.execHooks = policyValue(execVal("hooks"), "exec.hooks");
  policy.execMcp = policyValue(execVal("mcp"), "exec.mcp");
  policy.execSkillScripts = policyValue(
    execVal("skillScripts"),
    "exec.skillScripts",
  );
  const ni = execVal("nonInteractive");
  if (ni !== undefined) {
    if (ni !== "deny" && ni !== "allow") {
      throw new CliError(
        "config-invalid",
        `[policy] exec.nonInteractive must be deny | allow`,
      );
    }
    policy.execNonInteractive = ni;
  }
  policy.sourcesAllow = stringList(
    sources?.["allow"] as TomlValue | undefined ??
      (table["sources.allow"] as TomlValue | undefined),
    "sources.allow",
  );
  policy.sourcesDeny = stringList(
    sources?.["deny"] as TomlValue | undefined ??
      (table["sources.deny"] as TomlValue | undefined),
    "sources.deny",
  );
  return policy;
};

export const callersFromToml = (root: TomlTable): ServeCaller[] => {
  const serve = root.serve;
  if (serve === undefined || typeof serve !== "object" || Array.isArray(serve)) {
    return [];
  }
  const callers = (serve as TomlTable).caller;
  if (callers === undefined) return [];
  if (!Array.isArray(callers)) {
    throw new CliError("config-invalid", "serve.caller must be an array of tables");
  }
  const tables = callers.filter(
    (e): e is TomlTable => typeof e === "object" && e !== null,
  );
  return tables.map((entry, i) => {
    const name = entry.name;
    if (typeof name !== "string" || name === "") {
      throw new CliError(
        "config-invalid",
        `[[serve.caller]] #${i + 1}: name is required`,
      );
    }
    return {
      name,
      token: typeof entry.token === "string" ? entry.token : undefined,
      allow:
        entry.allow === undefined
          ? undefined
          : stringList(entry.allow as TomlValue, `serve.caller[${name}].allow`),
      deny:
        entry.deny === undefined
          ? undefined
          : stringList(entry.deny as TomlValue, `serve.caller[${name}].deny`),
    };
  });
};

/** What `ask` resolves to when `actor` cannot answer a prompt (trust.md §4.1). */
export const resolveExecDecision = (
  value: PolicyValue,
  interactive: boolean,
  policy: Policy,
): "allow" | "deny" | "ask" => {
  if (value === "allow") return "allow";
  if (value === "deny") return "deny";
  return interactive ? "ask" : policy.execNonInteractive;
};
