import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Justified dep beyond the `ai` catalog: the playground needs one concrete
// provider adapter for BYOK demo runs; `ai` ships none. openai-compatible
// covers OpenAI, Anthropic-compat gateways and local servers (LM Studio,
// mocks) through a single env-driven config.
export interface ModelEnv {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL_ID?: string;
}

export const modelFromEnv = (
  env: ModelEnv,
): { model: LanguageModel } | { error: string } => {
  if (!env.AI_BASE_URL || !env.AI_MODEL_ID) {
    return {
      error:
        "set AI_BASE_URL + AI_MODEL_ID (and AI_API_KEY if the provider requires it) " +
        "to run a real model",
    };
  }
  const provider = createOpenAICompatible({
    name: "playground-byok",
    baseURL: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
  });
  return { model: provider.chatModel(env.AI_MODEL_ID) };
};
