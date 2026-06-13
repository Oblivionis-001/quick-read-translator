import { describe, it, expect, vi } from "vitest";
import { handleTranslateMessage } from "@/interface-adapters/background/message-handler";
import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { TranslationCache } from "@/infrastructure/storage/TranslationCache";
import { AppConfig, ProviderConfig } from "@/shared/types";

/**
 * webextension-polyfill throws at module-evaluation time unless
 * globalThis.chrome.runtime.id exists. Run before any imports (including the
 * transitive import through handleTranslateMessage -> TranslationCache).
 */
vi.hoisted(() => {
  const g = globalThis as unknown as {
    chrome?: unknown;
    browser?: unknown;
  };
  g.chrome = { runtime: { id: "test-extension" } };
  g.browser = {
    runtime: { id: "test-extension" },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
    },
  };
});

/**
 * In-memory ConfigRepository that returns a fixed AppConfig. Avoids hitting
 * browser.storage in unit tests.
 */
class StubConfigRepo implements ConfigRepository {
  constructor(private readonly config: AppConfig) {}

  async load(): Promise<AppConfig | null> {
    return this.config;
  }

  async save(): Promise<void> {
    // no-op
  }
}

/**
 * Provider that ignores its input and returns a single canned
 * TranslationResult for each block id in the request. Mirrors what the
 * OpenAICompatibleProvider does at the type level without touching the
 * network.
 */
class StubProvider implements TranslationProvider {
  readonly id = "stub";
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async translate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const request of requests) {
      for (const blockId of request.blockIds) {
        results.push(
          new TranslationResult({
            blockId,
            translatedText: `[stub:${this.model}] ${request.targetLanguage}`,
            providerId: this.id,
            modelId: this.model,
            latencyMs: 1,
          })
        );
      }
    }
    return results;
  }
}

describe("handleTranslateMessage", () => {
  it("returns translated results for each block via the resolved provider", async () => {
    const providerConfig: ProviderConfig = {
      id: "stub-provider",
      name: "Stub",
      baseUrl: "https://example.test",
      apiKey: "key",
      model: "stub-model",
      temperature: 0,
      maxTokens: 256,
      systemPrompt: "",
      userPromptTemplate: "{{text}}",
      enabled: true,
    };
    const config: AppConfig = {
      targetLanguage: "zh-CN",
      sourceLanguage: "auto",
      currentProviderId: "stub-provider",
      providers: [providerConfig],
      hotkey: "Alt+T",
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };

    const response = await handleTranslateMessage(
      {
        type: "TRANSLATE_BLOCKS",
        targetLanguage: "zh-CN",
        blocks: [
          {
            id: "ignored",
            sourceText: "Hello",
            sourceLanguage: "auto",
          },
        ],
      },
      {
        configRepo: new StubConfigRepo(config),
        cache: new TranslationCache(),
        providerFactory: (cfg) => new StubProvider(cfg.model),
      }
    );

    expect(response.results).toHaveLength(1);
    expect(response.results[0].translatedText).toBe("[stub:stub-model] zh-CN");
    expect(response.results[0].providerId).toBe("stub");
    expect(response.results[0].modelId).toBe("stub-model");
    expect(response.results[0].latencyMs).toBe(1);
  });

  it("throws when no provider matches currentProviderId", async () => {
    const config: AppConfig = {
      targetLanguage: "zh-CN",
      sourceLanguage: "auto",
      currentProviderId: "does-not-exist",
      providers: [],
      hotkey: "Alt+T",
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };

    await expect(
      handleTranslateMessage(
        { type: "TRANSLATE_BLOCKS", targetLanguage: "zh-CN", blocks: [] },
        {
          configRepo: new StubConfigRepo(config),
          cache: new TranslationCache(),
          providerFactory: () => new StubProvider("stub-model"),
        }
      )
    ).rejects.toThrow(/No provider configured/);
  });
});
