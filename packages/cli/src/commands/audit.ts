/**
 * `harness audit` — read the trust audit log.
 *
 * `~/.agents/harness/audit.log` is append-only JSONL (trust.md §6.1). The
 * pinned Store surface has no audit op, so the cli reads it directly
 * through the fs port — read-only, tolerant of the partial last line a
 * crashed writer may leave (§6.1: skip and continue).
 */
import type { CliDeps } from "../deps.js";
import {
  assertNoUnknownFlags,
  flagBool,
  flagString,
  type ParsedArgs,
} from "../args.js";
import { emit, table } from "../output.js";

const KNOWN = ["json", "limit", "event", "actor", "extension"] as const;

export interface AuditEvent {
  ts: string;
  event: string;
  actor: string;
  extension?: { name: string; version: string };
  decision?: string;
  integrity?: string;
  source?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export const parseAuditLog = (text: string): AuditEvent[] => {
  const events: AuditEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as AuditEvent;
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

  const path = `${deps.storeRoot}/audit.log`;
  const exists = await deps.fs.exists(path);
  if (!exists) {
    emit(deps.w, { events: [] }, () => "no audit log yet", json);
    return;
  }

  const text = await deps.fs.readFile(path);
  let events = parseAuditLog(text);
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
