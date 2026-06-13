/**
 * AgentPlugins — OpenCode Platform Adapter
 *
 * @module @agentplugins/adapter-opencode
 */

// Re-export factory (main adapter creation)
export { createOpenCodeAdapter } from "./factory";
export { default } from "./factory";

// Re-export Wave 2 module public APIs
export { HOOK_MAPPING, EVENT_TYPE_CONDITIONS, EVENT_HOOKS } from "./hook-mapping";
export { buildHandlerInvocation } from "./handler-invocation";
export { generatePluginFile, generateManifest } from "./output-generators";
export { createValidate } from "./validate";
