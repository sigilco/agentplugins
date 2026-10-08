/**
 * `harness audit` — read the trust audit log.
 *
 * `~/.agents/harness/audit.log` is append-only JSONL (trust.md §6.1). The
 * store owns it (`Store.auditLog()` — torn-line tolerant per §6.1); the
 * cli owns filtering and presentation.
 */
import type { CliDeps } from "../deps.js";
import type { AuditRecord } from "../api.js";
import {
  assertNoUnknownFlags,
  flagBool,
  flagString,
  type ParsedArgs,
} from "../args.js";
import { emit, table } from "../output.js";

const KNOWN = ["json", "limit", "event", "actor", "extension"] as const;

/** Standalone JSONL parser — tolerant of a torn trailing line (§6.1). */
export const parseAuditLog = (text: string): AuditRecord[] => {
  const events: AuditRecord[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as AuditRecord;
      if (typeof parsed.ts === "string" && typeof parsed.event === "string") {
        events.push(parsed);
      }
    } catch {
      // Partial line from a crashed writer — skip and continue (§6.1).
    }
  }
  return events;
};

export const cmdAudit = async (
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const json = flagBool(args.flags, "json");
  const eventFilter = flagString(args.flags, "event");
  const actorFilter = flagString(args.flags, "actor");
  const extensionFilter = flagString(args.flags, "extension");
  const limitRaw = flagString(args.flags, "limit");
  const limit = limitRaw === undefined ? 50 : Number.parseInt(limitRaw, 10);

  let events = await deps.store.auditLog();
  if (events.length === 0) {
    emit(deps.w, { events: [] }, () => "no audit log yet", json);
    return;
  }
  if (eventFilter) events = events.filter((e) => e.event === eventFilter);
  if (actorFilter) events = events.filter((e) => e.actor === actorFilter);
  if (extensionFilter) {
    events = events.filter((e) => e.extension?.name === extensionFilter);
  }
  const shown = limit >= 0 ? events.slice(-limit) : events;

  emit(
    deps.w,
    { events: shown, total: events.length },
    () => {
      if (shown.length === 0) return "no audit events";
      return table([
        ["TS", "EVENT", "ACTOR", "EXTENSION", "DECISION"],
        ...shown.map((e) => [
          e.ts,
          e.event,
          e.actor,
          e.extension ? `${e.extension.name}@${e.extension.version}` : "-",
          e.decision ?? "-",
        ]),
      ]);
    },
    json,
  );
};
