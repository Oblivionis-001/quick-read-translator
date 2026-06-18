import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig, ProviderConfig } from "@/shared/types";
import {
  DEFAULT_HOTKEY,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  SCHEMA_VERSION,
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_TRANSLATION_THEME,
  DEFAULT_FLOATING_BALL_ENABLED,
} from "@/shared/constants";
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationError } from "@/domain/errors";

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

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

  /**
   * Run a single minimal translation via the provider to verify connectivity
   * and configuration. Bypasses TranslationCache and the orchestrator entirely
   * — we want a fresh, isolated round-trip.
   */
  async testProvider(providerId: string): Promise<ProviderTestResult> {
    const config = await this.getConfig();
    const providerCfg = config.providers.find((p) => p.id === providerId);
    if (!providerCfg) {
      return { ok: false, latencyMs: 0, message: `Provider not found: ${providerId}` };
    }
    const provider = new OpenAICompatibleProvider(providerCfg);
    const request = new TranslationRequest({
      blockIds: ['__test__'],
      combinedText: 'Hello',
      targetLanguage: config.targetLanguage,
      sourceLanguage: config.sourceLanguage,
    });
    // Measure the full round-trip including error mapping so the user sees
    // total wall time on both success and failure paths.
    const start = performance.now();
    try {
      const results = await provider.translate([request]);
      const translatedText = results[0]?.translatedText ?? '';
      const latencyMs = Math.round(performance.now() - start);
      return {
        ok: true,
        latencyMs,
        message: `Translated "Hello" → "${translatedText}"`,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const message = err instanceof TranslationError
        ? `${err.name}: ${err.message}`
        : err instanceof Error ? err.message : String(err);
      return { ok: false, latencyMs, message };
    }
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
      schemaVersion: SCHEMA_VERSION,
      selectorConfig: DEFAULT_SELECTOR_CONFIG,
      siteRules: [],
      translationTheme: DEFAULT_TRANSLATION_THEME,
      floatingBallEnabled: DEFAULT_FLOATING_BALL_ENABLED,
    };
  }
}
