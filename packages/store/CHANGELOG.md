# @agentplugins/store

## 0.5.0

### Minor Changes

- Initial release. Plugin install / link / update / detect lifecycle extracted from `@agentplugins/core` into its own package. Owns `installPlugin`, `updatePlugin`, `uninstallPlugin`, `detectAgents`, symlink management (`linkCompiledPlugin`, `unlinkCompiledPlugin`, `linkPluginSkills`, `linkNativeArtifacts`, `unlinkAll`), `validateCloneUrl`, `getSymlinks`, and the doctor/install helpers.
- **Setup-script runtime:** `resolveSetupCommand` (manifest field + auto-detect fallback), `hashSetupCommand` (sha256 over command + referenced script contents), `gateSetupCommand` (wraps `evaluateScriptPolicy` with a hard denylist), `runSetupCommand` (interactive `spawn`), and `readSetupRecord` / `writeSetupRecord` (trust persisted in `.agentplugins-meta.json`).
