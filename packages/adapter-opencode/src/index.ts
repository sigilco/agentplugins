/**
 * AgentPlugins — OpenCode Platform Adapter
 *
 * @module @agentplugins/adapter-opencode
 */

// Re-export factory (main adapter creation)
export { createOpenCodeAdapter } from "./factory.js";
export { default } from "./factory.js";

// Re-export Wave 2 module public APIs
export { HOOK_MAPPING, EVENT_TYPE_CONDITIONS, EVENT_HOOKS } from "./hook-mapping.js";
export { buildHandlerInvocation } from "./handler-invocation.js";
export { generatePluginFile, generateManifest } from "./output-generators.js";
export { createValidate } from "./validate.js";
