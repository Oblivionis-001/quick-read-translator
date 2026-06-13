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

/**
 * Validate that an unknown value (e.g. parsed JSON from an import file) has the
 * required shape of an AppConfig. Returns the value narrowed to AppConfig if
 * valid, or null if the shape is invalid.
 *
 * Required checks:
 *  - data must be a non-null object
 *  - providers must be a non-empty array
 *  - each provider must be an object with string id, baseUrl, model
 *  - currentProviderId must be a string and match one of the provider ids
 *
 * Optional fields and their types are not validated — they're not load-bearing
 * for safety and may evolve.
 */
export function validateImportedConfig(data: unknown): AppConfig | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const providers = obj.providers;
  if (!Array.isArray(providers) || providers.length === 0) return null;

  for (const p of providers) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const po = p as Record<string, unknown>;
    if (
      typeof po.id !== "string" ||
      typeof po.baseUrl !== "string" ||
      typeof po.model !== "string"
    ) {
      return null;
    }
  }

  if (typeof obj.currentProviderId !== "string") return null;
  if (!providers.some((p) => (p as { id: unknown }).id === obj.currentProviderId)) {
    return null;
  }

  return obj as unknown as AppConfig;
}
