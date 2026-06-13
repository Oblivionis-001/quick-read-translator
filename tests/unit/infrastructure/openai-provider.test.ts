import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { ProviderConfig } from "@/shared/types";

const testConfig: ProviderConfig = {
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-api-key",
  model: "gpt-4",
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt: "Translate to {{targetLanguage}}.",
  userPromptTemplate: "Translate: {{text}} to {{targetLanguage}}",
  enabled: true,
};

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "你好\n世界",
              },
            },
          ],
        }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns one TranslationResult with full translated content for single block", async () => {
    const provider = new OpenAICompatibleProvider(testConfig);
    const request = new TranslationRequest({
      blockIds: ["id1"],
      combinedText: "Hello",
      targetLanguage: "zh",
    });

    const results = await provider.translate([request]);

    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe("你好");
    expect(results[0].blockId).toBe("id1");
    expect(results[0].providerId).toBe("openai");
    expect(results[0].modelId).toBe("gpt-4");
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("splits multi-line response into one TranslationResult per blockId", async () => {
    const provider = new OpenAICompatibleProvider(testConfig);
    const request = new TranslationRequest({
      blockIds: ["id1", "id2"],
      combinedText: "Hello\nWorld",
      targetLanguage: "zh",
    });

    const results = await provider.translate([request]);

    expect(results).toHaveLength(2);
    expect(results[0].blockId).toBe("id1");
    expect(results[0].translatedText).toBe("你好");
    expect(results[1].blockId).toBe("id2");
    expect(results[1].translatedText).toBe("世界");
  });
});
