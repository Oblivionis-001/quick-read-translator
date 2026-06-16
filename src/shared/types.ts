export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
  enabled: boolean;
}

export interface AppConfig {
  targetLanguage: string;
  sourceLanguage: 'auto' | string;
  currentProviderId: string;
  providers: ProviderConfig[];
  hotkey: string;
  hoverButtonEnabled: boolean;
  selectionTriggerEnabled: boolean;
  localProxyUrl?: string;
  fallbackProviderId?: string;
}

export interface CacheEntry {
  translatedText: string;
  providerId: string;
  modelId: string;
  createdAt: number;
}
