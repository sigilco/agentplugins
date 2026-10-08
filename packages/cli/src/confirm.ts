/**
 * Mutating-operation confirmation:
 *
 *   `-y`            → proceed (caller attested)
 *   interactive TTY → hand-rolled y/N prompt (no prompt libs — AGENTS.md §7)
 *   non-interactive → refuse with confirmation-required
 *
 * (`exec.nonInteractive` in config.toml is deliberately NOT consulted here:
 * trust.md §4.1 scopes it to executable-class `ask` resolution, not to
 * confirming store mutations — `-y` is the only non-interactive attestation.)
 */
import type { CliDeps } from "./deps.js";
import { CliError } from "./errors.js";

export const confirm = async (
  deps: CliDeps,
  question: string,
  opts: { yes: boolean },
): Promise<void> => {
  if (opts.yes) return;
  if (deps.interactive && deps.confirm) {
    const ok = await deps.confirm(question);
    if (ok) return;
    throw new CliError("confirmation-required", "aborted by user");
  }
  throw new CliError(
    "confirmation-required",
    `${question} — confirmation required in non-interactive context; re-run with -y`,
    { details: { hint: "pass -y to proceed" } },
  );
};
