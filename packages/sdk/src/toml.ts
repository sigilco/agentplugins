/**
 * Minimal TOML reader for `harness/config.toml`.
 *
 * Supports the subset the spec's `[policy]` and `[[serve.caller]]` tables
 * need: sections, dotted keys, strings, integers, floats, booleans and
 * arrays of scalars. It is a *reader* — the sdk never writes config.toml
 * (policy changes come from the user's editor and are audited when
 * observed, per trust.md §4.2).
 */

type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
interface TomlTable {
  [key: string]: TomlValue;
}

export class TomlParseError extends Error {
  readonly line: number;
  constructor(line: number, message: string) {
    super(`TOML line ${line}: ${message}`);
    this.name = "TomlParseError";
    this.line = line;
  }
}

const unescapeBasic = (s: string): string =>
  s.replace(/\\(u[0-9a-fA-F]{4}|n|t|r|"|\\)/g, (m, esc: string) => {
    if (esc.startsWith("u")) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" }[esc] ?? m;
  });

const splitArray = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let strQuote = "";
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      current += ch;
      if (ch === "\\" && strQuote === '"') current += body[++i] ?? "";
      else if (ch === strQuote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strQuote = ch;
      current += ch;
      continue;
    }
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
};

const parseValue = (raw: string, line: number): TomlValue => {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2)
    return unescapeBasic(v.slice(1, -1));
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]"))
    return splitArray(v.slice(1, -1)).map((p) => parseValue(p, line));
  if (/^[+-]?\d+$/.test(v)) return parseInt(v, 10);
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(v)) return parseFloat(v);
  throw new TomlParseError(line, `unsupported value: ${v}`);
};

const stripComment = (line: string): string => {
  let inStr = false;
  let strQuote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === "\\" && strQuote === '"') i++;
      else if (ch === strQuote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strQuote = ch;
      continue;
    }
    if (ch === "#") return line.slice(0, i);
  }
  return line;
};

const setPath = (table: TomlTable, keys: string[], value: TomlValue, line: number): void => {
  let cur = table;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i].trim();
    const next = cur[k];
    if (next === undefined) cur[k] = {};
    else if (typeof next !== "object" || Array.isArray(next))
      throw new TomlParseError(line, `key ${k} conflicts with a scalar`);
    cur = cur[k] as TomlTable;
  }
  const leaf = keys[keys.length - 1].trim();
  if (cur[leaf] !== undefined) throw new TomlParseError(line, `duplicate key ${leaf}`);
  cur[leaf] = value;
};

const getSection = (root: TomlTable, keys: string[], array: boolean, line: number): TomlTable => {
  let cur = root;
  for (const rawKey of keys) {
    const k = rawKey.trim();
    let next = cur[k];
    if (next === undefined) {
      next = array && k === keys[keys.length - 1].trim() ? [] : {};
      cur[k] = next;
    }
    if (Array.isArray(next)) {
      if (next.length === 0 || typeof next[next.length - 1] !== "object")
        throw new TomlParseError(line, `array ${k} holds non-table values`);
      cur = next[next.length - 1] as TomlTable;
    } else if (typeof next === "object") {
      cur = next as TomlTable;
    } else {
      throw new TomlParseError(line, `key ${k} conflicts with a scalar`);
    }
  }
  return cur;
};

/** Parse a TOML document into a plain object (subset of TOML 1.0). */
export const parseToml = (text: string): Record<string, unknown> => {
  const root: TomlTable = {};
  let section = root;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === "") continue;
    const arraySection = line.match(/^\[\[(.+)\]\]$/);
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (arraySection) {
      const keys = arraySection[1].split(".");
      const parent = getSection(root, keys.slice(0, -1), false, i + 1);
      const leaf = keys[keys.length - 1].trim();
      let arr = parent[leaf];
      if (arr === undefined) {
        arr = [];
        parent[leaf] = arr;
      }
      if (!Array.isArray(arr))
        throw new TomlParseError(i + 1, `${leaf} is not an array of tables`);
      const table: TomlTable = {};
      (arr as TomlValue[]).push(table);
      section = table;
      continue;
    }
    if (sectionMatch) {
      const keys = sectionMatch[1].split(".");
      section = getSection(root, keys, false, i + 1);
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) throw new TomlParseError(i + 1, `unrecognized syntax: ${line}`);
    setPath(section, kv[1].split("."), parseValue(kv[2], i + 1), i + 1);
  }
  return root as Record<string, unknown>;
};
