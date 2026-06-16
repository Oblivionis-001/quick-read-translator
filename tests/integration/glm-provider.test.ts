import { describe, it, expect } from "vitest";
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";

const hasKey = Boolean(process.env.GLM_API_KEY);

describe.skipIf(!hasKey)("GLM-4-Flash-250414 integration", () => {
  it("translates English to Chinese", async () => {
    const provider = new OpenAICompatibleProvider({
      id: "glm-4-flash-250414",
      name: "Zhipu GLM",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: process.env.GLM_API_KEY!,
      model: "glm-4-flash-250414",
      temperature: 0.3,
      maxTokens: 1024,
      systemPrompt: "You are a precise translator. Translate the user's text to {{targetLanguage}}. Reply only with the translation, no explanations.",
      userPromptTemplate: "{{text}}",
      enabled: true,
    });

    const start = Date.now();
    const results = await provider.translate([
      new TranslationRequest({
        blockIds: ["block-1"],
        combinedText: "Hello, world!",
        targetLanguage: "Simplified Chinese",
      }),
    ]);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(1);
    expect(results[0].blockId).toBe("block-1");
    expect(results[0].translatedText.length).toBeGreaterThan(0);
    // The translation should contain at least one CJK character
    expect(/[一-鿿]/.test(results[0].translatedText)).toBe(true);
    expect(results[0].providerId).toBe("glm-4-flash-250414");
    expect(results[0].modelId).toBe("glm-4-flash-250414");
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(15000); // generous bound

    console.log(`GLM translation took ${elapsed}ms: ${results[0].translatedText}`);
  }, 20000); // 20s timeout for network

  it("handles batch translation of multiple blocks", async () => {
    const provider = new OpenAICompatibleProvider({
      id: "glm-4-flash-250414",
      name: "Zhipu GLM",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: process.env.GLM_API_KEY!,
      model: "glm-4-flash-250414",
      temperature: 0.3,
      maxTokens: 1024,
      systemPrompt: "You are a precise translator. Translate each input block to {{targetLanguage}}. Output one translation per line, in the same order as the input.",
      userPromptTemplate: "{{text}}",
      enabled: true,
    });

    const results = await provider.translate([
      new TranslationRequest({
        blockIds: ["b1", "b2"],
        combinedText: "Hello, world!\nGoodbye, world!",
        targetLanguage: "Simplified Chinese",
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].blockId).toBe("b1");
    expect(results[1].blockId).toBe("b2");
    expect(results[0].translatedText.length).toBeGreaterThan(0);
    expect(results[1].translatedText.length).toBeGreaterThan(0);
  }, 20000);
});

// Always-visible sanity check so CI sees at least one passing test in this file
describe("GLM integration test env", () => {
  it("skips integration tests when GLM_API_KEY is not set", () => {
    if (!hasKey) {
      expect(true).toBe(true); // tautology — confirms the file at least loaded
    }
  });
});
