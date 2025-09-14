export const llmProviderEnv: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function getApiKey(provider: string): string | undefined {
  const env = llmProviderEnv[provider];
  return env ? process.env[env] : undefined;
}
