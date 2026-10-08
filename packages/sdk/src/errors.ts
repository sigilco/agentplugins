/**
 * Internal error vocabulary. `StoreError` carries a machine-readable
 * `kind` that `handleBridgeRequest` maps onto the protocol's error table
 * (spec/bridge/protocol.md §4.2).
 */

export type ErrorKind =
  | "version-mismatch"
  | "handshake-required"
  | "capability-unsupported"
  | "not-found"
  | "manifest-invalid"
  | "hook-failed"
  | "policy-denied"
  | "trust-violation"
  | "auth-failed"
  | "transport-unavailable"
  | "conflict"
  | "forbidden"
  | "request-cancelled"
  | "mcp"
  | "invalid"
  | "internal";

export class StoreError extends Error {
  readonly kind: ErrorKind;
  readonly data?: Record<string, unknown>;
  constructor(kind: ErrorKind, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = "StoreError";
    this.kind = kind;
    this.data = data;
  }
}

export const notFound = (resource: string, name: string): StoreError =>
  new StoreError("not-found", `${resource} not found: ${name}`, {
    resource,
    name,
  });

export const policyDenied = (policy: string, message: string): StoreError =>
  new StoreError("policy-denied", message, { policy });

export const trustViolation = (
  expected: string | undefined,
  actual: string,
  message?: string,
): StoreError =>
  new StoreError(
    "trust-violation",
    message ?? "integrity check failed",
    { expected, actual },
  );

export const conflict = (message: string): StoreError =>
  new StoreError("conflict", message);
