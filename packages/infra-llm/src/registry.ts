import { AnthropicAdapter } from "./adapters/anthropic.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { OpenAiAdapter } from "./adapters/openai.js";
import { OpenAiCompatibleAdapter } from "./adapters/openai-compatible.js";
import type { ProviderAdapter, ProviderId } from "./types.js";

/**
 * One adapter per provider (Ticket 04 §5 GREEN reuse rule).
 * Adding a provider means adding one adapter and one entry here.
 */
export const providerRegistry: Readonly<Record<ProviderId, ProviderAdapter>> = {
  openai: new OpenAiAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
  ollama: new OllamaAdapter(),
  "openai-compatible": new OpenAiCompatibleAdapter(),
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return providerRegistry[provider];
}
