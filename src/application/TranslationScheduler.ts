import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { NetworkError, RateLimitError } from "@/domain/errors";

export interface SchedulerOptions {
  /** Maximum number of retries after the initial attempt. Default: 2. */
  readonly maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  readonly baseDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * Coordinates translation of multiple {@link TranslationRequest}s through a
 * single {@link TranslationProvider}, applying retry-with-backoff to each
 * request independently.
 *
 * Only {@link NetworkError} and {@link RateLimitError} are considered
 * retryable; all other errors (auth, validation, provider) propagate
 * immediately.
 */
export class TranslationScheduler {
  private readonly provider: TranslationProvider;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(provider: TranslationProvider, options?: SchedulerOptions) {
    this.provider = provider;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  /**
   * Translate each request in order, collecting all results. Retries are
   * applied per-request; a non-retryable error thrown by one request
   * short-circuits the whole batch.
   */
  async schedule(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const request of requests) {
      const requestResults = await this.translateWithRetry(request);
      results.push(...requestResults);
    }

    return results;
  }

  private async translateWithRetry(
    request: TranslationRequest
  ): Promise<TranslationResult[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.provider.translate([request]);
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        // No more retries left; let the loop exit and rethrow below.
        if (attempt === this.maxRetries) {
          break;
        }

        const delay = this.calculateDelay(error, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof NetworkError || error instanceof RateLimitError;
  }

  /**
   * Compute the backoff delay for the given attempt index.
   * - RateLimitError with a `retryAfter` (seconds) takes precedence and
   *   returns retryAfter * 1000 ms.
   * - Otherwise: baseDelayMs * 2^attempt.
   */
  private calculateDelay(error: unknown, attempt: number): number {
    if (error instanceof RateLimitError && typeof error.retryAfter === "number") {
      return error.retryAfter * 1000;
    }
    return this.baseDelayMs * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
