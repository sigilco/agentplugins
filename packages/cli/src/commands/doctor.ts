import type { CliDeps } from "../deps.js";
import { assertNoUnknownFlags, flagBool, type ParsedArgs } from "../args.js";
import { emit, table } from "../output.js";

const KNOWN = ["json"] as const;

export const cmdDoctor = async (
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const json = flagBool(args.flags, "json");

  const report = await deps.store.doctor();
  emit(
    deps.w,
    report,
    () => {
      if (report.findings.length === 0) return "store healthy — no findings";
      return table([
        ["SEVERITY", "CODE", "PATH", "MESSAGE"],
        ...report.findings.map((f) => [
          f.severity,
          f.code,
          f.path ?? f.extension ?? "-",
          f.message,
        ]),
      ]);
    },
    json,
  );

  // Doctor exits non-zero on error-severity findings — findings themselves
  // are the report; the exit code is the signal for scripts.
  if (report.findings.some((f) => f.severity === "error")) {
    deps.setExitCode(1);
  }
};
