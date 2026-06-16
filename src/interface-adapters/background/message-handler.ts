import { ConfigService } from "@/application/ConfigService";
import { TranslatePageUseCase } from "@/application/TranslatePageUseCase";
import { TranslationScheduler } from "@/application/TranslationScheduler";
import { BlockMerger } from "@/domain/services/BlockMerger";
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import { TranslationCache } from "@/infrastructure/storage/TranslationCache";
import { ProviderConfig } from "@/shared/types";

export interface TranslateMessageBlock {
  id: string;
  sourceText: string;
  sourceLanguage: string;
  domReference?: string;
}

export interface TranslateMessage {
  type: "TRANSLATE_BLOCKS";
  blocks: TranslateMessageBlock[];
  targetLanguage: string;
}

export interface TranslateResponseBlock {
  blockId: string;
  translatedText: string;
  providerId: string;
  modelId: string;
  latencyMs: number;
}

export interface TranslateResponseError {
  blockId: string;
  message: string;
}

export interface TranslateResponse {
  ok: boolean;
  results?: TranslateResponseBlock[];
  /**
   * Per-block error markers. Populated when the scheduler threw a
   * short-circuiting error before producing any results (e.g. provider
   * auth failure, exhausted retries). Each entry corresponds to an input
   * block so the content-script orchestrator can surface a ⚠️ with retry
   * button next to it.
   */
  errors?: TranslateResponseError[];
  /** Top-level error message when ok === false. */
  error?: string;
}

/**
 * Factory that builds a TranslationProvider from a ProviderConfig. The
 * default implementation constructs the real OpenAI-compatible HTTP client;
 * tests pass their own to substitute a canned translation.
 */
export type ProviderFactory = (config: ProviderConfig) => TranslationProvider;

/**
 * Collaborator bundle for {@link handleTranslateMessage}. Exposed so tests
 * can inject in-memory doubles without restructuring the handler into many
 * small functions. The default factory wires concrete infrastructure backed
 * by browser.storage and the OpenAI-compatible provider.
 */
export interface MessageHandlerDeps {
  configRepo: ConfigRepository;
  cache: TranslationCache;
  providerFactory: ProviderFactory;
}

export const defaultProviderFactory: ProviderFactory = (config) =>
  new OpenAICompatibleProvider(config);

export function defaultMessageHandlerDeps(): MessageHandlerDeps {
  return {
    configRepo: new BrowserStorageConfigRepo(),
    cache: new TranslationCache(),
    providerFactory: defaultProviderFactory,
  };
}

/**
 * Handle a TRANSLATE_BLOCKS message from a content script: load config,
 * resolve the active provider, build a TranslatePageUseCase, and execute it
 * over the incoming blocks.
 *
 * Always returns a {@link TranslateResponse}. On success the response is
 * `{ ok: true, results: [...] }`. On failure it is `{ ok: false, error,
 * errors }` where `errors` mirrors the input block ids so the
 * content-script orchestrator can surface a ⚠️ and a per-block retry
 * button for each block that did not get translated.
 */
export async function handleTranslateMessage(
  message: TranslateMessage,
  deps: MessageHandlerDeps = defaultMessageHandlerDeps()
): Promise<TranslateResponse> {
  const blocks = message.blocks.map(
    (b) =>
      new ParagraphBlock({
        sourceText: b.sourceText,
        sourceLanguage: b.sourceLanguage,
        domReference: b.domReference,
      })
  );

  try {
    const configService = new ConfigService(deps.configRepo);
    const config = await configService.getConfig();
    const providerConfig = config.providers.find(
      (p) => p.id === config.currentProviderId
    );
    if (!providerConfig) {
      throw new Error(
        `No provider configured for id "${config.currentProviderId}"`
      );
    }

    const provider = deps.providerFactory(providerConfig);
    const scheduler = new TranslationScheduler(provider);
    const merger = new BlockMerger({ maxTokens: 1024 });

    const useCase = new TranslatePageUseCase({
      scheduler,
      merger,
      cache: deps.cache,
      promptVersion: "v1",
      providerId: providerConfig.id,
      modelId: providerConfig.model,
    });

    const results: TranslationResult[] = await useCase.execute(
      blocks,
      message.targetLanguage
    );

    return {
      ok: true,
      results: results.map((r) => ({
        blockId: r.blockId,
        translatedText: r.translatedText,
        providerId: r.providerId,
        modelId: r.modelId,
        latencyMs: r.latencyMs,
      })),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: errorMsg,
      errors: blocks.map((b) => ({ blockId: b.id, message: errorMsg })),
    };
  }
}
