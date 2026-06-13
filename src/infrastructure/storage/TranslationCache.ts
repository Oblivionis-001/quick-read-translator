import browser from "webextension-polyfill";
import { CACHE_TTL_MS } from "@/shared/constants";
import type { CacheEntry } from "@/shared/types";

const STORAGE_KEY = "translationCache";

type CacheEntries = Record<string, CacheEntry>;

/**
 * Persistent translation cache backed by browser.storage.local. Entries expire
 * after {@link CACHE_TTL_MS}. Reads of expired entries return null and leave
 * the stored entry in place (lazy expiry); callers may invoke {@link clear}
 * to reset the cache wholesale.
 */
export class TranslationCache {
  async get(cacheKey: string): Promise<CacheEntry | null> {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const entries = (data[STORAGE_KEY] as CacheEntries | undefined) ?? {};
    const entry = entries[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) return null;
    return entry;
  }

  async set(cacheKey: string, entry: CacheEntry): Promise<void> {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const entries = (data[STORAGE_KEY] as CacheEntries | undefined) ?? {};
    entries[cacheKey] = entry;
    await browser.storage.local.set({ [STORAGE_KEY]: entries });
  }

  async clear(): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: {} });
  }
}
