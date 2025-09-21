import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { mistral } from "@ai-sdk/mistral";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AiModel } from "@timonteutelink/template-types-lib";

import { getApiKey, getConnectedProviders } from "../config/ai-providers";
import { getDefaultModelName, PROVIDER_PRIORITY, withDefaultModelName } from "../lib/ai-model-utils";

export function resolveModelChoice(
  requested: AiModel | undefined,
  connectedProviders: string[] = getConnectedProviders(),
): AiModel | undefined {
  if (requested) {
    return withDefaultModelName(requested);
  }

  if (connectedProviders.length === 0) {
    return undefined;
  }

  const provider =
    PROVIDER_PRIORITY.find((candidate) => connectedProviders.includes(candidate)) ??
    connectedProviders[0];

  return {
    provider,
    name: getDefaultModelName(provider),
  };
}

export function createLanguageModel(model: AiModel): LanguageModel | undefined {
  const apiKey = getApiKey(model.provider);
  if (!apiKey) {
    return undefined;
  }

  switch (model.provider) {
    case "anthropic":
      return anthropic(model.name);
    case "groq":
      return groq(model.name);
    case "mistral":
      return mistral(model.name);
    case "google":
      return google(model.name);
    case "openai":
    default:
      return openai(model.name);
  }
}

export function resolveLanguageModel(
  requested: AiModel | undefined,
  connectedProviders?: string[],
): { model: AiModel; client: LanguageModel } | undefined {
  const resolved = resolveModelChoice(requested, connectedProviders);
  if (!resolved) {
    return undefined;
  }

  const client = createLanguageModel(resolved);
  if (!client) {
    return undefined;
  }

  return { model: resolved, client };
}
