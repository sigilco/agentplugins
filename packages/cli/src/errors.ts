/**
 * CLI error model. Every failure leaves through `CliError`: `kind` is a
 * stable kebab-case machine string (mirrors `data.kind` on the bridge),
 * `exitCode` maps to process exit codes:
 *
 *   0 success · 1 runtime failure · 2 usage · 3 not-found ·
 *   4 policy/trust refusal · 5 confirmation required
 */
export class CliError extends Error {
  readonly kind: string;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    kind: string,
    message: string,
    opts: { exitCode?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "CliError";
    this.kind = kind;
    this.exitCode = opts.exitCode ?? exitCodeForKind(kind);
    this.details = opts.details;
  }
}

const KIND_EXIT: Record<string, number> = {
  usage: 2,
  "invalid-params": 2,
  "not-found": 3,
  "policy-denied": 4,
  "trust-violation": 4,
  "confirmation-required": 5,
};

const exitCodeForKind = (kind: string): number => KIND_EXIT[kind] ?? 1;

/** Coerce any thrown value into a CliError for the top-level handler. */
export const toCliError = (err: unknown): CliError => {
  if (err instanceof CliError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CliError("internal", message);
};
