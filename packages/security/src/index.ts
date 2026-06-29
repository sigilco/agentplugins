/**
 * @agentplugins/security
 *
 * Security and trust primitives used by `agentplugins add`, `agentplugins audit`,
 * and the `@agentplugins/migrate` MCP server. The package is intentionally
 * dependency-free beyond the schema package and Node built-ins — it must run
 * offline, in CI, and inside sandboxed install steps without bundling a
 * runtime that attackers can pivot through.
 */

export {
  hashDirectory,
  hashFile,
  verifyIntegrity,
  formatIntegrity,
  parseIntegrity,
  type IntegrityResult,
} from './integrity.js';

export {
  safeFetch,
  isPrivateAddress,
  isBlockedHost,
  getDefaultAllowList,
  type SafeFetchOptions,
  type SafeFetchResult,
} from './safe-fetch.js';

export {
  evaluateScriptPolicy,
  evaluateManifestScripts,
  DEFAULT_POLICY,
  type ScriptPolicy,
  type ScriptDecision,
  type ScriptContext,
  type ManifestScriptIssue,
} from './scripts.js';

export {
  runOsvScanner,
  isOsvScannerAvailable,
  type OsvScannerResult,
  type OsvFinding,
} from './osv.js';

export {
  runScorecard,
  isScorecardAvailable,
  type ScorecardResult,
} from './scorecard.js';

export {
  checkNpmProvenance,
  isNpmProvenanceAvailable,
  type NpmProvenanceResult,
} from './provenance.js';
