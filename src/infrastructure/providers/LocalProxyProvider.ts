import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { NetworkError, ProviderError, ValidationError } from "@/domain/errors";

/**
 * Stub implementation of TranslationProvider that forwards translation requests
 * to a user-defined local proxy server. The proxy is expected to expose
 * `POST /translate` accepting a JSON-serialized TranslationRequest and returning
 * `{ results: TranslationResult[] }`.
 *
 * The scheduler fallback logic (Section 5.4 of the design spec) is NOT
 * implemented in MVP — this provider exists so the architecture is in place
 * when local-proxy support becomes a priority.
 */
export class LocalProxyProvider implements TranslationProvider {
  readonly id: string;
  private readonly proxyUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { id: string; proxyUrl: string; fetchImpl?: typeof fetch }) {
    this.id = opts.id;
    this.proxyUrl = opts.proxyUrl.replace(/\/$/, ""); // trim trailing slash
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async translate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const allResults: TranslationResult[] = [];

    for (const request of requests) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.proxyUrl}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blockIds: request.blockIds,
            combinedText: request.combinedText,
            targetLanguage: request.targetLanguage,
            sourceLanguage: request.sourceLanguage,
            context: request.context,
          }),
        });
      } catch (e) {
        throw new NetworkError(
          e instanceof Error ? e.message : "Local proxy network error"
        );
      }

      if (!response.ok) {
        throw new ProviderError(
          response.status,
          `Local proxy error: ${response.status}`
        );
      }

      const data: unknown = await response.json();
      const results = (data as { results?: unknown }).results;
      if (!Array.isArray(results)) {
        throw new ValidationError();
      }

      for (const r of results) {
        if (!this.isValidResult(r)) {
          throw new ValidationError();
        }
        allResults.push(
          new TranslationResult({
            blockId: r.blockId,
            translatedText: r.translatedText,
            providerId: r.providerId,
            modelId: r.modelId,
            latencyMs: r.latencyMs,
          })
        );
      }
    }

    return allResults;
  }

  private isValidResult(
    value: unknown
  ): value is {
    blockId: string;
    translatedText: string;
    providerId: string;
    modelId: string;
    latencyMs: number;
  } {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.blockId === "string" &&
      typeof v.translatedText === "string" &&
      typeof v.providerId === "string" &&
      typeof v.modelId === "string" &&
      typeof v.latencyMs === "number"
    );
  }
}
