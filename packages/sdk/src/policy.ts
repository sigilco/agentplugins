/**
 * Trust policy — spec/trust.md §4. Reads `harness/config.toml`'s
 * `[policy]` table; ships the spec's required defaults; evaluates exec
 * decisions (deny/ask/allow) and source allowlists.
 */

import { parseToml } from "./toml.js";
import { matchesAnyGlob } from "./glob.js";
import type { Actor, ExecClass, PolicyDecision, SourceRef, TrustPolicy } from "./types.js";
import { FsPort } from "./ports.js";

const POLICY_DECISIONS = new Set<PolicyDecision>(["deny", "ask", "allow"]);

export const DEFAULT_POLICY: TrustPolicy = {
  exec: {
    setup: "ask",
    hooks: "ask",
    mcp: "ask",
    skillScripts: "ask",
    nonInteractive: "deny",
  },
  sources: { allow: [], deny: [] },
};

const readDecision = (v: unknown, fallback: PolicyDecision): PolicyDecision =>
  typeof v === "string" && POLICY_DECISIONS.has(v as PolicyDecision)
    ? (v as PolicyDecision)
    : fallback;

const readStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export interface PolicyRead {
  policy: TrustPolicy;
  /** Set when config.toml existed but failed to parse. */
  corrupt?: string;
}

export const parsePolicyText = (text: string): PolicyRead => {
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(text);
  } catch (e) {
    return { policy: DEFAULT_POLICY, corrupt: (e as Error).message };
  }
  const policyTable =
    typeof doc["policy"] === "object" && doc["policy"] !== null
      ? (doc["policy"] as Record<string, unknown>)
      : {};
  const execTable =
    typeof policyTable["exec"] === "object" && policyTable["exec"] !== null
      ? (policyTable["exec"] as Record<string, unknown>)
      : {};
  const sourcesTable =
    typeof policyTable["sources"] === "object" && policyTable["sources"] !== null
      ? (policyTable["sources"] as Record<string, unknown>)
      : {};
  return {
    policy: {
      exec: {
        setup: readDecision(execTable["setup"], DEFAULT_POLICY.exec.setup),
        hooks: readDecision(execTable["hooks"], DEFAULT_POLICY.exec.hooks),
        mcp: readDecision(execTable["mcp"], DEFAULT_POLICY.exec.mcp),
        skillScripts: readDecision(execTable["skillScripts"], DEFAULT_POLICY.exec.skillScripts),
        nonInteractive:
          execTable["nonInteractive"] === "allow" ? "allow" : "deny",
      },
      sources: {
        allow: readStringArray(sourcesTable["allow"]),
        deny: readStringArray(sourcesTable["deny"]),
      },
    },
  };
};

export const loadPolicy = async (fs: FsPort, configPath: string): Promise<PolicyRead> => {
  try {
    const text = new TextDecoder().decode(await fs.readFile(configPath));
    return parsePolicyText(text);
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "not-found")
      return { policy: DEFAULT_POLICY };
    throw e;
  }
};

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Does policy allow installing from this source at all?
 * `sources.deny` is checked first; a non-empty `sources.allow` must match.
 * The match target is the source's canonical URI plus, for git/github,
 * the resolved clone URL — so allowlists can pin either form.
 */
export const sourceAllowed = (policy: TrustPolicy, source: SourceRef): boolean => {
  const candidates = [source.uri];
  if (source.type === "github") candidates.push(`https://github.com/${source.uri}.git`);
  if (matchesAnyGlob(policy.sources.deny, source.uri)) return false;
  if (candidates.slice(1).some((c) => matchesAnyGlob(policy.sources.deny, c))) return false;
  if (policy.sources.allow.length === 0) return true;
  return candidates.some((c) => matchesAnyGlob(policy.sources.allow, c));
};

/**
 * Whether `source` is on the allowlist specifically — trust.md §4.2: only
 * allowlisted provenance lets `ask` survive an agent actor.
 */
export const sourceAllowlisted = (policy: TrustPolicy, source: SourceRef): boolean =>
  policy.sources.allow.length > 0 && sourceAllowed(policy, source);

/**
 * Resolve an exec-class decision for an actor (trust.md §4.1/§4.2).
 * `ask` → `exec.nonInteractive` when the actor cannot answer, or when the
 * actor is an agent and the source is not allowlisted.
 */
export const resolveExecDecision = (
  policy: TrustPolicy,
  execClass: ExecClass,
  actor: Actor,
  source?: SourceRef,
): PolicyDecision => {
  const decision = policy.exec[execClass];
  if (decision !== "ask") return decision;
  if (actor === "user") return "ask";
  // §4.2: an agent's `ask` survives only for allowlisted provenance.
  if (actor === "agent")
    return source !== undefined && sourceAllowlisted(policy, source) ? "ask" : "deny";
  return policy.exec.nonInteractive;
};
