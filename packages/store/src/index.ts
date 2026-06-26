/**
 * @agentplugins/store — universal plugin store
 *
 * Manages ~/.agents/plugins/<name>/: clone, install, symlink fan-out to every
 * detected agent harness, skills.sh compatibility. Extracted from
 * @agentplugins/core in v0.5.0; core re-exports this surface, so most consumers
 * should import from @agentplugins/core.
 */

export * from './store.js';
