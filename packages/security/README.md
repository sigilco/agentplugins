# @agentplugins/security

Security and trust primitives for AgentPlugins v0.3.0.

Used by `agentplugins add`, `agentplugins audit`, and the `@agentplugins/migrate` MCP server. The package is intentionally dependency-free beyond `@agentplugins/schema` and Node built-ins — it must run offline, in CI, and inside sandboxed install steps.

## What's in the box

| Module        | Exports                                                            | Purpose                                                              |
| ------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `integrity`   | `hashDirectory`, `hashFile`, `verifyIntegrity`, `formatIntegrity`, `parseIntegrity` | Deterministic SHA-256 over a source tree; matches `manifest.integrity`. |
| `safe-fetch`  | `safeFetch`, `isPrivateAddress`, `isBlockedHost`, `getDefaultAllowList` | SSRF-safe fetch wrapper with host allow-list + DNS-rebind mitigation. |
| `scripts`     | `evaluateScriptPolicy`, `DEFAULT_POLICY`                            | Default-deny lifecycle script policy with hard denylist.             |
| `osv`         | `runOsvScanner`, `isOsvScannerAvailable`                            | Wrapper around `osv-scanner` for OSV vulnerability lookups.          |
| `scorecard`   | `runScorecard`, `isScorecardAvailable`                              | Wrapper around the OpenSSF `scorecard` CLI for supply-chain scoring.|
| `provenance`  | `checkNpmProvenance`, `isNpmProvenanceAvailable`                    | Wrapper around `npm audit signatures` for OIDC provenance checks.   |

The three CLI wrappers (`osv`, `scorecard`, `provenance`) check whether the underlying CLI is on `PATH` and return a `skipped` result with a `note` if not. The audit command surfaces this so installs still work in minimal environments.

## Posture

- **Default-deny** for lifecycle scripts (no phases in the default allow-list).
- **No SSRF** without an explicit allow-list entry.
- **No install-time writes** outside the package API.
- **No network** during install beyond the explicitly-allowed fetch call.

## License

MIT
