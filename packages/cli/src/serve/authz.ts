/**
 * Per-caller op authorization — spec/bridge/transports.md §3.
 *
 * Enforcement is per request, before dispatch:
 *   - `capabilities.negotiate` and `events.notify` are auto-granted to
 *     every caller (§3.3 — negotiate can't be denied, request.cancelled
 *     rides the notify op)
 *   - caller's `deny` wins over `allow`; absent `allow` = full op set;
 *     `"*"` is legal in `allow` only
 *   - denied → `-32012` `forbidden` with `data.op` naming the method
 *
 * stdio identity is the implicit `"owner"` caller (§3.2): full op set —
 * unless the operator has written an explicit `[[serve.caller]]` entry
 * named `owner`, in which case its scope applies (a deliberate opt-in
 * narrowing, not a default).
 */
import { ALWAYS_ALLOWED_METHODS } from "../api.js";
import type { ServeCaller } from "../config.js";

export const STDIO_CALLER = "owner";

export type AuthzDecision = { ok: true } | { ok: false; op: string };

export const authorize = (
  caller: ServeCaller | undefined,
  method: string,
): AuthzDecision => {
  if (ALWAYS_ALLOWED_METHODS.has(method)) return { ok: true };
  if (caller === undefined) return { ok: true };
  if (caller.deny?.includes(method)) return { ok: false, op: method };
  if (caller.allow === undefined) return { ok: true };
  if (caller.allow.includes("*") || caller.allow.includes(method)) {
    return { ok: true };
  }
  return { ok: false, op: method };
};

/** Look up a configured caller by name (audit/scope key). */
export const callerByName = (
  callers: ServeCaller[],
  name: string,
): ServeCaller | undefined => callers.find((c) => c.name === name);
