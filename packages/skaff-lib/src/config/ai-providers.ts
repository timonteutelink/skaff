export const llmProviderEnv: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export function getApiKey(provider: string): string | undefined {
  const env = llmProviderEnv[provider];
  return env ? process.env[env] : undefined;
}

export function getConnectedProviders(): string[] {
  return Object.entries(llmProviderEnv)
    .filter(([, envVar]) => !!process.env[envVar])
    .map(([provider]) => provider);
}
