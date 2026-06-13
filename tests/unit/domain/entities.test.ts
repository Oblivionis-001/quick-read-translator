import { describe, it, expect } from "vitest";
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";

describe("ParagraphBlock", () => {
  it("creates block with id derived from text", () => {
    const block = new ParagraphBlock({
      sourceText: "Hello world",
      sourceLanguage: "en",
    });
    expect(block.id).toBeDefined();
    expect(block.sourceText).toBe("Hello world");
    expect(block.sourceLanguage).toBe("en");
  });

  it("produces same id for same text and language", () => {
    const block1 = new ParagraphBlock({
      sourceText: "Same text",
      sourceLanguage: "en",
    });
    const block2 = new ParagraphBlock({
      sourceText: "Same text",
      sourceLanguage: "en",
    });
    expect(block1.id).toBe(block2.id);
  });

  it("produces different id for different text", () => {
    const block1 = new ParagraphBlock({
      sourceText: "Text A",
      sourceLanguage: "en",
    });
    const block2 = new ParagraphBlock({
      sourceText: "Text B",
      sourceLanguage: "en",
    });
    expect(block1.id).not.toBe(block2.id);
  });
});

describe("TranslationRequest", () => {
  it("combines multiple block texts", () => {
    const block1 = new ParagraphBlock({
      sourceText: "First paragraph",
      sourceLanguage: "en",
    });
    const block2 = new ParagraphBlock({
      sourceText: "Second paragraph",
      sourceLanguage: "en",
    });

    const request = new TranslationRequest({
      blockIds: [block1.id, block2.id],
      combinedText: `${block1.sourceText}\n${block2.sourceText}`,
      targetLanguage: "zh",
      sourceLanguage: "en",
    });

    expect(request.blockIds).toEqual([block1.id, block2.id]);
    expect(request.combinedText).toBe("First paragraph\nSecond paragraph");
    expect(request.targetLanguage).toBe("zh");
    expect(request.sourceLanguage).toBe("en");
  });

  it("defaults sourceLanguage to auto", () => {
    const request = new TranslationRequest({
      blockIds: ["abc"],
      combinedText: "some text",
      targetLanguage: "zh",
    });

    expect(request.sourceLanguage).toBe("auto");
  });
});

describe("TranslationResult", () => {
  it("maps translated text to block id", () => {
    const result = new TranslationResult({
      blockId: "block-123",
      translatedText: "Translated text",
      providerId: "openai",
      modelId: "gpt-4o",
      latencyMs: 250,
    });

    expect(result.blockId).toBe("block-123");
    expect(result.translatedText).toBe("Translated text");
    expect(result.providerId).toBe("openai");
    expect(result.modelId).toBe("gpt-4o");
    expect(result.latencyMs).toBe(250);
  });
});
