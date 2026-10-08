/**
 * Audit log — `harness/audit.log`, append-only JSONL (trust.md §6).
 * One object per line; writers must already hold `harness/.lock`.
 * Records never carry secrets (§6.3) — `details` is call-site data.
 */

import { FsPort } from "./ports.js";
import type { AuditRecord } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const appendAudit = async (
  fs: FsPort,
  auditPath: string,
  record: AuditRecord,
): Promise<void> => {
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(auditPath, encoder.encode(line));
};

/** Read the log, tolerating partial lines from crashed writers (§6.1). */
export const readAudit = async (
  fs: FsPort,
  auditPath: string,
): Promise<{ records: AuditRecord[]; skipped: number }> => {
  let text: string;
  try {
    text = decoder.decode(await fs.readFile(auditPath));
  } catch {
    return { records: [], skipped: 0 };
  }
  const records: AuditRecord[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      records.push(JSON.parse(trimmed) as AuditRecord);
    } catch {
      skipped++;
    }
  }
  return { records, skipped };
};
