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
 * providerId, modelId, promptVersion). On the lookup pass we cannot know the
 * provider/model that will be selected, so we use placeholder sentinel
 * values "current" — these will only collide with a previously-written entry
 * that was itself written under the same sentinel, i.e. one produced by an
 * equivalent lookup. Real provider/model ids are stamped onto entries
 * written back after a fresh translation.
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
        providerId: "current",
        modelId: "current",
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
        providerId: result.providerId,
        modelId: result.modelId,
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
