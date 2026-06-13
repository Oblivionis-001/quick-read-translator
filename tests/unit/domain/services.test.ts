import { describe, it, expect } from "vitest";
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { BlockMerger, BlockMergerOptions } from "@/domain/services/BlockMerger";
import { HashCache } from "@/domain/services/HashCache";

describe("BlockMerger", () => {
  it("merges adjacent blocks under maxTokens", () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello world", sourceLanguage: "en" }),
      new ParagraphBlock({ sourceText: "Good morning", sourceLanguage: "en" }),
      new ParagraphBlock({ sourceText: "How are you", sourceLanguage: "en" }),
    ];
    const merger = new BlockMerger({ maxTokens: 20, tokensPerChar: 0.5 });
    const requests = merger.merge(blocks, "zh");

    expect(requests).toHaveLength(1);
    expect(requests[0].combinedText).toBe("Hello world\nGood morning\nHow are you");
    expect(requests[0].blockIds).toEqual(blocks.map((b) => b.id));
    expect(requests[0].targetLanguage).toBe("zh");
  });

  it("splits blocks exceeding maxTokens", () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello world", sourceLanguage: "en" }),
      new ParagraphBlock({ sourceText: "Good morning everyone", sourceLanguage: "en" }),
      new ParagraphBlock({ sourceText: "How are you", sourceLanguage: "en" }),
    ];
    const merger = new BlockMerger({ maxTokens: 10, tokensPerChar: 0.5 });
    const requests = merger.merge(blocks, "zh");

    // "Hello world" = 11 chars * 0.5 = 5.5 => ceil = 6 tokens
    // "Good morning everyone" = 21 chars * 0.5 = 10.5 => ceil = 11 tokens
    // "How are you" = 11 chars * 0.5 = 5.5 => ceil = 6 tokens
    // So first batch: ["Hello world"] = 6 tokens (can't add next because 6+11=17 > 10)
    // Second batch: ["Good morning everyone"] = 11 tokens > 10, so it goes alone
    // Third batch: ["How are you"] = 6 tokens
    expect(requests).toHaveLength(3);
    expect(requests[0].combinedText).toBe("Hello world");
    expect(requests[1].combinedText).toBe("Good morning everyone");
    expect(requests[2].combinedText).toBe("How are you");
  });

  it("returns empty array for empty blocks", () => {
    const merger = new BlockMerger({ maxTokens: 100 });
    const requests = merger.merge([], "zh-CN");
    expect(requests).toEqual([]);
  });

  it("emits a single oversized block as its own batch", () => {
    const longText = "a".repeat(100);
    const blocks = [
      new ParagraphBlock({ sourceText: "short", sourceLanguage: "en" }),
      new ParagraphBlock({ sourceText: longText, sourceLanguage: "en" }),
    ];
    const merger = new BlockMerger({ maxTokens: 10, tokensPerChar: 0.5 });
    const requests = merger.merge(blocks, "zh");

    // "short" = 5 chars * 0.5 = 2.5 => ceil = 3 tokens
    // longText = 100 chars * 0.5 = 50 tokens > maxTokens=10, so it goes alone
    expect(requests).toHaveLength(2);
    expect(requests[0].combinedText).toBe("short");
    expect(requests[1].combinedText).toBe(longText);
    expect(requests[1].blockIds).toHaveLength(1);
  });
});

describe("HashCache", () => {
  it("generates a deterministic truthy string", () => {
    const input = {
      sourceText: "Hello",
      sourceLanguage: "en",
      targetLanguage: "zh",
      providerId: "openai",
      modelId: "gpt-4",
      promptVersion: "1.0",
    };
    const key1 = HashCache.makeKey(input);
    const key2 = HashCache.makeKey(input);

    expect(key1).toBeTruthy();
    expect(key1).toBe(key2);
  });

  it("produces different keys when modelId changes", () => {
    const base = {
      sourceText: "Hello",
      sourceLanguage: "en",
      targetLanguage: "zh",
      providerId: "openai",
      modelId: "gpt-4",
      promptVersion: "1.0",
    };
    const key1 = HashCache.makeKey(base);
    const key2 = HashCache.makeKey({ ...base, modelId: "gpt-3.5" });

    expect(key1).not.toBe(key2);
  });
});
