import type { AppConfig, ProviderConfig } from "@/shared/types";

/**
 * Create a fresh provider with sensible defaults. The id is caller-supplied
 * so the caller controls uniqueness (e.g. timestamp-based).
 */
export function createProvider(id: string): ProviderConfig {
  return {
    id,
    name: "New Provider",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1024,
    systemPrompt: "You are a professional translator.",
    userPromptTemplate:
      "Translate the following text to {{target}}:\n\n{{source}}",
    enabled: true,
  };
}

export interface AddProviderResult {
  config: AppConfig;
  newId: string;
}

export function addProvider(
  config: AppConfig,
  idGenerator: () => string
): AddProviderResult {
  const newId = idGenerator();
  const newProvider = createProvider(newId);
  return {
    config: {
      ...config,
      providers: [...config.providers, newProvider],
      currentProviderId: newId,
    },
    newId,
  };
}

export interface DeleteProviderResult {
  config: AppConfig;
}

export function deleteProvider(
  config: AppConfig,
  id: string
): DeleteProviderResult | null {
  if (config.providers.length <= 1) {
    return null;
  }
  const remaining = config.providers.filter((p) => p.id !== id);
  return {
    config: {
      ...config,
      providers: remaining,
      currentProviderId:
        config.currentProviderId === id
          ? remaining[0].id
          : config.currentProviderId,
    },
  };
}

export function updateProvider(
  config: AppConfig,
  id: string,
  patch: Partial<ProviderConfig>
): AppConfig {
  return {
    ...config,
    providers: config.providers.map((p) =>
      p.id === id ? { ...p, ...patch } : p
    ),
  };
}
