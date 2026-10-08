/**
 * Store-root resolution — store-layout.md §3.5. Precedence:
 * `--root` flag > `ANYHARNESS_STORE` > `ANYHARNESS_HOME` > `~/.agents`.
 *
 * The resolved value is the **agents root** (`~/.agents`) — the sdk owns
 * `harness/` underneath it and reads the `skills/` + `mcp.json` siblings.
 */
export const resolveStoreRoot = (
  env: Record<string, string | undefined>,
  home: string,
  rootFlag?: string,
): string => {
  if (rootFlag) return rootFlag;
  if (env.ANYHARNESS_STORE) return env.ANYHARNESS_STORE;
  return env.ANYHARNESS_HOME ?? `${home}/.agents`;
};
