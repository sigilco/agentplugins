/**
 * Output + logging surface. The scriptc island bans logtape-class deps and
 * assumes nothing about TTY capability, so this is a console shim over two
 * injected writers:
 *
 *   - data goes to `out` (stdout): command results, JSON envelopes
 *   - diagnostics go to `err` (stderr): logs, prompts, warnings
 *
 * `harness serve` additionally must keep stdout protocol-clean (NDJSON
 * only), so every diagnostic path lives here behind `err`.
 */
export interface OutWriters {
  out: (text: string) => void;
  err: (text: string) => void;
}

export const stdoutWriters = (proc: {
  stdout: { write(s: string): unknown };
  stderr: { write(s: string): unknown };
}): OutWriters => ({
  out: (text) => {
    proc.stdout.write(`${text}\n`);
  },
  err: (text) => {
    proc.stderr.write(`${text}\n`);
  },
});

/** Emit the command result: pretty JSON under --json, human text otherwise. */
export const emit = (
  w: OutWriters,
  result: unknown,
  human: () => string,
  json: boolean,
): void => {
  if (json) {
    w.out(JSON.stringify(result, null, 2));
  } else {
    w.out(human());
  }
};

/** Emit an error: structured envelope under --json, plain line otherwise. */
export const emitError = (
  w: OutWriters,
  error: { kind: string; message: string; details?: Record<string, unknown> },
  json: boolean,
): void => {
  if (json) {
    w.out(
      JSON.stringify({
        error: { kind: error.kind, message: error.message, ...error.details },
      }),
    );
  } else {
    w.err(`error: ${error.message}`);
  }
};

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Console shim — level-gated stderr logging (`ANYHARNESS_LOG` env). */
export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const createLogger = (
  w: OutWriters,
  level: LogLevel = "info",
): Logger => {
  const write =
    (at: LogLevel) =>
    (msg: string): void => {
      if (LEVEL_RANK[at] >= LEVEL_RANK[level]) w.err(`[${at}] ${msg}`);
    };
  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
};

/** Plain aligned table for human output (no terminal-columns dep). */
export const table = (rows: string[][]): string => {
  if (rows.length === 0) return "";
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i])))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
};
