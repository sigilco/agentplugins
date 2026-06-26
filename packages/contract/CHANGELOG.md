# @agentplugins/contract

## 0.4.0

### Minor Changes

- Initial release: single-source-of-truth Zod manifest schema for AgentPlugins. Derives TypeScript types via `z.infer<>` and generates `manifest.schema.json` at build time. `PluginManifest` is defined as a concrete interface for zod-free consumer type resolution.
