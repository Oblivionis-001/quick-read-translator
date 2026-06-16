import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { HashCache } from "@/domain/services/HashCache";
import type { CacheEntry } from "@/shared/types";

/**
 * Structural shapes of the collaborators this use case needs. Declared as
 * interfaces (rather than importing the concrete classes) so tests can pass
 * plain-object mocks without satisfying the full public surface of each
 * class — only the methods actually invoked by {@link TranslatePageUseCase}.
 */

/** Scheduler: accepts merged requests, returns their translated results. */
export interface TranslatePageScheduler {
  schedule(requests: TranslationRequest[]): Promise<TranslationResult[]>;
}

/** Merger: groups small blocks into fewer provider requests. */
export interface TranslatePageMerger {
  merge(blocks: ParagraphBlock[], targetLanguage: string): TranslationRequest[];
}

/** Cache: persistent key/value store for translated text. */
export interface TranslatePageCache {
  get(cacheKey: string): Promise<CacheEntry | null>;
  set(cacheKey: string, entry: CacheEntry): Promise<void>;
}

export interface TranslatePageUseCaseDeps {
  scheduler: TranslatePageScheduler;
  merger: TranslatePageMerger;
  cache: TranslatePageCache;
  /**
   * Bumped whenever the translation prompt changes, so that cached entries
   * produced by an older prompt never satisfy a newer cache key.
   */
  promptVersion: string;
  /**
   * The resolved provider id of the provider that will be used to translate
   * any cache-missed blocks. Used as part of the cache key for both lookup
   * and write-back so the two passes use identical keys.
   */
  providerId: string;
  /**
   * The resolved model id of the provider that will be used to translate any
   * cache-missed blocks. Used as part of the cache key for both lookup and
   * write-back so the two passes use identical keys.
   */
  modelId: string;
}

/**
 * Orchestrates translation of a page's paragraph blocks through the cache
 * and provider-backed scheduler.
 *
 * Flow:
 *   1. For each block, look up its cache key. Cache hits become results
 *      immediately; misses accumulate as `uncachedBlocks`.
 *   2. If every block was cached, return early without scheduling.
 *   3. Otherwise merge the uncached blocks into batched requests, schedule
 *      them through the provider, write each translated result back to the
 *      cache, and return cached + freshly-translated results together.
 *
 * The cache key is derived from (sourceText, sourceLanguage, targetLanguage,
 * providerId, modelId, promptVersion). The resolved providerId and modelId
 * for this run are passed in as deps and used in BOTH the lookup key and the
 * write-back key, so a second execute() with the same inputs finds the entry
 * the first call wrote. The cached entry's providerId/modelId fields retain
 * whatever the originating provider stamped on them (preserving the original
 * provider info), but those values are NOT used to derive the cache key —
 * only the deps values are.
 */
export class TranslatePageUseCase {
  constructor(private readonly deps: TranslatePageUseCaseDeps) {}

  async execute(
    blocks: ParagraphBlock[],
    targetLanguage: string
  ): Promise<TranslationResult[]> {
    const uncachedBlocks: ParagraphBlock[] = [];
    const cachedResults: TranslationResult[] = [];

    for (const block of blocks) {
      const key = HashCache.makeKey({
        sourceText: block.sourceText,
        sourceLanguage: block.sourceLanguage,
        targetLanguage,
        providerId: this.deps.providerId,
        modelId: this.deps.modelId,
        promptVersion: this.deps.promptVersion,
      });

      const cached = await this.deps.cache.get(key);
      if (cached) {
        cachedResults.push(
          new TranslationResult({
            blockId: block.id,
            translatedText: cached.translatedText,
            providerId: cached.providerId,
            modelId: cached.modelId,
            latencyMs: 0,
          })
        );
      } else {
        uncachedBlocks.push(block);
      }
    }

    if (uncachedBlocks.length === 0) {
      return cachedResults;
    }

    const requests = this.deps.merger.merge(uncachedBlocks, targetLanguage);
    const translated = await this.deps.scheduler.schedule(requests);

    for (const result of translated) {
      const block = uncachedBlocks.find((b) => b.id === result.blockId);
      if (!block) continue;

      const key = HashCache.makeKey({
        sourceText: block.sourceText,
        sourceLanguage: block.sourceLanguage,
        targetLanguage,
        providerId: this.deps.providerId,
        modelId: this.deps.modelId,
        promptVersion: this.deps.promptVersion,
      });

      const entry: CacheEntry = {
        translatedText: result.translatedText,
        providerId: result.providerId,
        modelId: result.modelId,
        createdAt: Date.now(),
      };
      await this.deps.cache.set(key, entry);
    }

    return [...cachedResults, ...translated];
  }
}
