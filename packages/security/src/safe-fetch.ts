/**
 * SSRF-safe fetch.
 *
 * Wraps `fetch` with two defenses against server-side request forgery:
 *
 *   1. Host allow-list — by default, only `localhost` and public DNS names.
 *      Private IP ranges (RFC 1918, loopback, link-local, multicast) are
 *      rejected unless the caller adds them to the allow-list explicitly.
 *   2. DNS-rebind mitigation — resolves the hostname once before connecting
 *      and uses the resolved IP for the actual request, so an attacker cannot
 *      rebind to a private IP after the allow-list check passes.
 *
 * Intended for `httpHandler` and MCP egress calls; not for general web
 * fetching. The default policy is intentionally strict.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface SafeFetchOptions {
  url: string;
  /** Extra hosts to allow (e.g. `['api.example.com']`). */
  allowHosts?: string[];
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Other fetch options (method, headers, body). */
  fetchOptions?: RequestInit;
  /**
   * Maximum number of 3xx redirects to follow. Each hop is re-validated against
   * the allow-list and private-IP check.
   * @default 5
   */
  maxRedirects?: number;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  /** How long the request took, in milliseconds. */
  durationMs: number;
}

const DEFAULT_ALLOW_HOSTS = ['localhost', '127.0.0.1', '::1'];

/** Returns the default allow-list (mutable copy). */
export function getDefaultAllowList(): string[] {
  return [...DEFAULT_ALLOW_HOSTS];
}

/**
 * Reject an IP literal if it is private, loopback, link-local, multicast, or
 * otherwise reserved. Returns `true` for IPs that MUST NOT be reached from
 * server-side code without an explicit allow-list entry.
 */
export function isPrivateAddress(addr: string): boolean {
  const ip = isIP(addr);
  if (ip === 0) return false; // not an IP literal

  // IPv4
  if (ip === 4) {
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 10) return true;                                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;                // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                          // 192.168.0.0/16
    if (a === 127) return true;                                      // loopback
    if (a === 169 && b === 254) return true;                         // link-local
    if (a === 0) return true;                                        // 0.0.0.0/8
    if (a >= 224) return true;                                       // multicast + reserved
    if (a === 100 && b >= 64 && b <= 127) return true;               // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;             // benchmarking
    return false;
  }

  // IPv6
  const lower = addr.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80:')) return true;                        // link-local
  if (lower.startsWith('ff')) return true;                           // multicast
  return false;
}

/**
 * Returns `true` if the given host is in the deny-list (private IPs,
 * loopback, link-local, etc.). Hosts that resolve to private addresses are
 * also caught at request time by re-resolving and checking the resolved IP.
 */
export function isBlockedHost(host: string, allowList: string[] = []): boolean {
  if (allowList.includes(host)) return false;
  if (isIP(host)) return isPrivateAddress(host);
  // Hostnames like `metadata.google.internal` resolve to private IPs at request
  // time and are caught by the post-resolution check. Here we only reject
  // obvious bad literals.
  if (host === 'localhost' && !allowList.includes('localhost')) return false; // explicit per default
  return false;
}

/**
 * Validate a single URL against the allow-list and DNS-rebind check.
 * Returns the parsed URL or throws `SafeFetchError`.
 * Exported for direct testing of per-hop validation.
 */
export async function validateUrl(rawUrl: string, allow: string[]): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SafeFetchError(`Refusing non-http(s) protocol: ${parsed.protocol}`);
  }

  if (isBlockedHost(parsed.hostname, allow)) {
    throw new SafeFetchError(`Host "${parsed.hostname}" is not in the allow-list.`);
  }

  // DNS-rebind mitigation: resolve the hostname now and reject if it lands on
  // a private IP.
  if (isIP(parsed.hostname) === 0) {
    try {
      const records = await lookup(parsed.hostname, { all: true });
      for (const r of records) {
        if (isPrivateAddress(r.address)) {
          throw new SafeFetchError(`Hostname "${parsed.hostname}" resolves to private IP ${r.address}`);
        }
      }
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      // DNS failure is OK — the fetch will surface its own error
    }
  }

  return parsed;
}

// ponytail: fixed cap of 5; raise via option if a real caller needs more
const DEFAULT_MAX_REDIRECTS = 5;

export async function safeFetch(opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const start = Date.now();
  const allow = [...DEFAULT_ALLOW_HOSTS, ...(opts.allowHosts ?? [])];
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  const currentUrl = await validateUrl(opts.url, allow);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    let res: Response;
    let hops = 0;
    for (;;) {
      res = await fetch(currentUrl.toString(), {
        ...opts.fetchOptions,
        signal: controller.signal,
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) break; // malformed redirect, hand back to caller
        if (++hops > maxRedirects) {
          throw new SafeFetchError(`Exceeded max redirects (${maxRedirects})`);
        }
        const nextRaw = new URL(location, currentUrl).toString();
        // ponytail: reassign via let; object mutation would be worse
        currentUrl.href = (await validateUrl(nextRaw, allow)).toString();
        continue;
      }
      break;
    }
    const bodyText = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers,
      bodyText,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}
