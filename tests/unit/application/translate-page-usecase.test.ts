import { describe, it, expect, vi } from "vitest";
import { TranslatePageUseCase } from "@/application/TranslatePageUseCase";
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { CacheEntry } from "@/shared/types";

/**
 * Tests pass plain object mocks for scheduler / merger / cache because the
 * deps interface is structurally typed. The mocks only need to expose the
 * specific methods the use case actually invokes.
 */

describe("TranslatePageUseCase", () => {
  it("returns translated results for blocks", async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello", sourceLanguage: "en" }),
    ];

    const scheduler = {
      schedule: vi
        .fn<(requests: TranslationRequest[]) => Promise<TranslationResult[]>>()
        .mockResolvedValue([
          new TranslationResult({
            blockId: blocks[0].id,
            translatedText: "你好",
            providerId: "fake",
            modelId: "m",
            latencyMs: 10,
          }),
        ]),
    };

    const merger = {
      merge: vi
        .fn<(blocks: ParagraphBlock[], targetLanguage: string) => TranslationRequest[]>()
        .mockReturnValue([
          new TranslationRequest({
            blockIds: [blocks[0].id],
            combinedText: "Hello",
            targetLanguage: "zh-CN",
          }),
        ]),
    };

    const cache = {
      get: vi.fn<(key: string) => Promise<CacheEntry | null>>().mockResolvedValue(null),
      set: vi.fn<(key: string, entry: CacheEntry) => Promise<void>>().mockResolvedValue(undefined),
    };

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache,
      promptVersion: "v1",
    });
    const results = await useCase.execute(blocks, "zh-CN");

    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe("你好");
    expect(results[0].blockId).toBe(blocks[0].id);
    expect(scheduler.schedule).toHaveBeenCalledOnce();
  });

  it("uses cached entry when present and does NOT call scheduler", async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello", sourceLanguage: "en" }),
    ];

    const cachedEntry: CacheEntry = {
      translatedText: "你好（cached）",
      providerId: "fake",
      modelId: "m",
      createdAt: Date.now(),
    };

    const scheduler = {
      schedule: vi.fn().mockResolvedValue([]),
    };

    const merger = {
      merge: vi.fn().mockReturnValue([]),
    };

    const cache = {
      get: vi.fn().mockResolvedValue(cachedEntry),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache,
      promptVersion: "v1",
    });
    const results = await useCase.execute(blocks, "zh-CN");

    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe("你好（cached）");
    expect(results[0].providerId).toBe("fake");
    expect(results[0].modelId).toBe("m");
    // Critical: cache hit must short-circuit before scheduling / merging.
    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(merger.merge).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("writes translated result back to cache after scheduling", async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello", sourceLanguage: "en" }),
    ];

    const translated = [
      new TranslationResult({
        blockId: blocks[0].id,
        translatedText: "你好",
        providerId: "fake",
        modelId: "m",
        latencyMs: 12,
      }),
    ];

    const scheduler = {
      schedule: vi.fn().mockResolvedValue(translated),
    };

    const merger = {
      merge: vi
        .fn<(blocks: ParagraphBlock[], targetLanguage: string) => TranslationRequest[]>()
        .mockReturnValue([
          new TranslationRequest({
            blockIds: [blocks[0].id],
            combinedText: "Hello",
            targetLanguage: "zh-CN",
          }),
        ]),
    };

    const cache = {
      get: vi.fn<(key: string) => Promise<CacheEntry | null>>().mockResolvedValue(null),
      set: vi.fn<(key: string, entry: CacheEntry) => Promise<void>>().mockResolvedValue(undefined),
    };

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache,
      promptVersion: "v1",
    });
    await useCase.execute(blocks, "zh-CN");

    expect(cache.set).toHaveBeenCalledOnce();
    const [key, entry] = cache.set.mock.calls[0];
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(entry.translatedText).toBe("你好");
    expect(entry.providerId).toBe("fake");
    expect(entry.modelId).toBe("m");
    expect(typeof entry.createdAt).toBe("number");
  });
});
