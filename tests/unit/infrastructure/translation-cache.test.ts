import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationCache } from "@/infrastructure/storage/TranslationCache";
import { CACHE_TTL_MS } from "@/shared/constants";
import type { CacheEntry } from "@/shared/types";

/**
 * webextension-polyfill throws at module-evaluation time unless
 * globalThis.chrome.runtime.id exists, and it exports whatever object is on
 * globalThis.browser (when that also has a runtime.id). vi.hoisted runs before
 * any imports in this file (including the transitive import from
 * TranslationCache), so the polyfill picks up our mock. We swap the in-memory
 * storage implementation per test via beforeEach.
 */
vi.hoisted(() => {
  // Cast to a typed record: webextension-polyfill reads globalThis.chrome and
  // globalThis.browser at module-evaluation time, and TS's globalThis type has
  // no index signature for them in this project.
  const g = globalThis as unknown as {
    chrome?: unknown;
    browser?: unknown;
  };
  g.chrome = { runtime: { id: "test-extension" } };
  g.browser = {
    runtime: { id: "test-extension" },
    storage: { local: { get: async () => ({}), set: async () => {} } },
  };
});

function createMockStore() {
  const store: Record<string, unknown> = {};
  return {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys === undefined || keys === null) {
          return { ...store };
        }
        const keyList = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of keyList) {
          if (k in store) out[k] = store[k];
        }
        return out;
      }),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        Object.assign(store, entries);
      }),
    },
  };
}

describe("TranslationCache", () => {
  let cache: TranslationCache;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    mockStore = createMockStore();
    // The polyfill exported the same object reference as globalThis.browser,
    // so we replace its storage.local with our fresh per-test implementation.
    const browserObj = globalThis as unknown as {
      browser: { storage: { local: unknown } };
    };
    browserObj.browser.storage.local = mockStore.local;
    cache = new TranslationCache();
  });

  it("returns null for a missing entry", async () => {
    const result = await cache.get("missing-key");

    expect(result).toBeNull();
  });

  it("stores and retrieves an entry", async () => {
    const entry: CacheEntry = {
      translatedText: "你好",
      providerId: "glm",
      modelId: "glm-4",
      createdAt: Date.now(),
    };

    await cache.set("hello", entry);
    const result = await cache.get("hello");

    expect(result).not.toBeNull();
    expect(result).toEqual(entry);
  });

  it("returns null for an expired entry (createdAt older than TTL)", async () => {
    const staleEntry: CacheEntry = {
      translatedText: "过期",
      providerId: "glm",
      modelId: "glm-4",
      createdAt: Date.now() - CACHE_TTL_MS - 1, // just past TTL
    };

    await cache.set("stale", staleEntry);
    const result = await cache.get("stale");

    expect(result).toBeNull();
  });

  it("clear() empties the cache", async () => {
    const entry: CacheEntry = {
      translatedText: "你好",
      providerId: "glm",
      modelId: "glm-4",
      createdAt: Date.now(),
    };

    await cache.set("hello", entry);
    await cache.clear();

    const result = await cache.get("hello");
    expect(result).toBeNull();
  });
});
