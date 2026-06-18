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
      providerId: "fake",
      modelId: "m",
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
      providerId: "fake",
      modelId: "m",
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
      providerId: "fake",
      modelId: "m",
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

  it("regression: second execute() over the same block is a cache hit (scheduler not invoked again)", async () => {
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
            providerId: "glm",
            modelId: "glm-4-flash",
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

    // Real in-memory cache that actually persists between execute() calls.
    const store = new Map<string, CacheEntry>();
    const cache = {
      get: vi.fn<(key: string) => Promise<CacheEntry | null>>().mockImplementation((key) => Promise.resolve(store.get(key) ?? null)),
      set: vi.fn<(key: string, entry: CacheEntry) => Promise<void>>().mockImplementation((key, entry) => {
        store.set(key, entry);
        return Promise.resolve();
      }),
    };

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache,
      promptVersion: "v1",
      providerId: "glm",
      modelId: "glm-4-flash",
    });

    // First pass: cache miss, scheduler invoked, result cached.
    await useCase.execute(blocks, "zh-CN");
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);

    // Second pass: cache hit, scheduler NOT invoked.
    await useCase.execute(blocks, "zh-CN");
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
  });

  it("forwards onProgress callback to scheduler.schedule", async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello", sourceLanguage: "en" }),
    ];

    const onProgress = vi.fn();
    const scheduler = {
      schedule: vi
        .fn<
          (
            requests: TranslationRequest[],
            cb?: unknown
          ) => Promise<TranslationResult[]>
        >()
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
      providerId: "fake",
      modelId: "m",
    });

    await useCase.execute(blocks, "zh-CN", onProgress);

    // The callback must be forwarded as the second argument to schedule.
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    expect(scheduler.schedule.mock.calls[0][1]).toBe(onProgress);
  });

  it("does NOT call onProgress on a cache-hit path (scheduler not invoked)", async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: "Hello", sourceLanguage: "en" }),
    ];
    const onProgress = vi.fn();

    const scheduler = {
      schedule: vi.fn(),
    };
    const merger = {
      merge: vi.fn(),
    };
    const cache = {
      get: vi.fn().mockResolvedValue({
        translatedText: "你好",
        providerId: "fake",
        modelId: "m",
        createdAt: Date.now(),
      } satisfies CacheEntry),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache,
      promptVersion: "v1",
      providerId: "fake",
      modelId: "m",
    });

    await useCase.execute(blocks, "zh-CN", onProgress);

    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });
});
