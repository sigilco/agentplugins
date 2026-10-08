/**
 * YAML-frontmatter reader for component `.md` files (commands, agents,
 * rules) and `SKILL.md`. Supports the converged subset those formats use:
 * `key: scalar`, `key: [a, b]`, and block lists (`key:` then `- item`
 * lines). Values are strings or string arrays — numbers/booleans come
 * back as their textual form, matching how these formats are consumed.
 */

export interface Frontmatter {
  [key: string]: string | string[] | undefined;
}

export interface FrontmatterDocument {
  frontmatter: Frontmatter;
  body: string;
}

const parseInlineList = (raw: string): string[] | null => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
};

const unquote = (s: string): string => s.trim().replace(/^["']|["']$/g, "");

/** Parse a `---` fenced frontmatter block + body. Absent block → empty fm. */
export const parseFrontmatter = (text: string): FrontmatterDocument => {
  const normalized = text.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) return { frontmatter: {}, body: normalized };
  const firstLineEnd = normalized.indexOf("\n");
  if (firstLineEnd < 0) return { frontmatter: {}, body: normalized };
  if (normalized.slice(0, firstLineEnd).trim() !== "---")
    return { frontmatter: {}, body: normalized };
  const close = normalized.indexOf("\n---", firstLineEnd);
  if (close < 0) return { frontmatter: {}, body: normalized };
  const fmText = normalized.slice(firstLineEnd + 1, close);
  const bodyStart = normalized.indexOf("\n", close + 1);
  const body = bodyStart < 0 ? "" : normalized.slice(bodyStart + 1);

  const frontmatter: Frontmatter = {};
  const fmLines = fmText.split("\n");
  let listKey: string | null = null;
  for (const rawLine of fmLines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && listKey !== null) {
      (frontmatter[listKey] as string[]).push(unquote(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) {
      listKey = null;
      continue;
    }
    const [, key, rawValue] = kv;
    if (rawValue.trim() === "") {
      frontmatter[key] = [];
      listKey = key;
      continue;
    }
    const inline = parseInlineList(rawValue);
    frontmatter[key] = inline ?? unquote(rawValue);
    listKey = null;
  }
  return { frontmatter, body };
};
