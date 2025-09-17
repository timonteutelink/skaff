import type { AiModel } from "@timonteutelink/template-types-lib";

export const PROVIDER_PRIORITY = [
  "openai",
  "anthropic",
  "groq",
  "mistral",
  "google",
] as const;

export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet",
  groq: "llama-3.1-70b-versatile",
  mistral: "mistral-large-latest",
  google: "models/gemini-1.5-flash",
};

const FALLBACK_PROVIDER = PROVIDER_PRIORITY[0];

export function getDefaultModelName(provider: string): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL_BY_PROVIDER[FALLBACK_PROVIDER];
}

export function withDefaultModelName(model: AiModel): AiModel {
  return {
    provider: model.provider,
    name: model.name || getDefaultModelName(model.provider),
  };
}
