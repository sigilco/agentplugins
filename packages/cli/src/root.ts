/**
 * Store-root resolution — store-layout.md §3.5. Precedence:
 * `--root` flag > `ANYHARNESS_STORE` > `ANYHARNESS_HOME`/harness >
 * `~/.agents/harness`.
 */
export const resolveStoreRoot = (
  env: Record<string, string | undefined>,
  home: string,
  rootFlag?: string,
): string => {
  if (rootFlag) return rootFlag;
  if (env.ANYHARNESS_STORE) return env.ANYHARNESS_STORE;
  const agentsRoot = env.ANYHARNESS_HOME ?? `${home}/.agents`;
  return `${agentsRoot}/harness`;
};
