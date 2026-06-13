import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig, ProviderConfig } from "@/shared/types";
import {
  DEFAULT_HOTKEY,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from "@/shared/constants";

export const DEFAULT_PROVIDER: ProviderConfig = {
  id: "glm",
  name: "Zhipu GLM",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "",
  model: "glm-4-flash-250414",
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt:
    "You are a professional translator. Translate the following text to {{targetLanguage}}. Preserve paragraphs. Only output the translation.",
  userPromptTemplate: "{{text}}",
  enabled: true,
};

export class ConfigService {
  private cache: AppConfig | null = null;

  constructor(private readonly repo: ConfigRepository) {}

  async getConfig(): Promise<AppConfig> {
    if (this.cache) {
      return this.cache;
    }

    const loaded = await this.repo.load();
    if (loaded) {
      this.cache = loaded;
      return loaded;
    }

    const created = this.createDefault();
    this.cache = created;
    return created;
  }

  async saveConfig(config: AppConfig): Promise<void> {
    this.cache = config;
    await this.repo.save(config);
  }

  /**
   * Drop the in-memory cache. The next getConfig() call will reload from the
   * underlying repo. Used when storage is written outside ConfigService (e.g.
   * the import flow writes directly via browser.storage.local.set).
   */
  clearCache(): void {
    this.cache = null;
  }

  private createDefault(): AppConfig {
    return {
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
      currentProviderId: DEFAULT_PROVIDER.id,
      providers: [DEFAULT_PROVIDER],
      hotkey: DEFAULT_HOTKEY,
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };
  }
}
