import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { TranslationScheduler } from "@/application/TranslationScheduler";
import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import {
  AuthError,
  NetworkError,
  RateLimitError,
} from "@/domain/errors";

/**
 * In-memory TranslationProvider for tests. Uses a vi.fn so test cases can
 * control per-call resolution/rejection by chaining mockImplementationOnce.
 */
class FakeProvider implements TranslationProvider {
  readonly id = "fake";
  readonly translate: MockedFunction<
    (requests: TranslationRequest[]) => Promise<TranslationResult[]>
  > = vi.fn();
}

function makeRequest(text = "Hello", blockIds = ["id1"]): TranslationRequest {
  return new TranslationRequest({
    blockIds,
    combinedText: text,
    targetLanguage: "zh",
  });
}

function makeResult(blockId: string, translatedText: string): TranslationResult {
  return new TranslationResult({
    blockId,
    translatedText,
    providerId: "fake",
    modelId: "fake-model",
    latencyMs: 5,
  });
}

describe("TranslationScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("translates requests through provider", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);
    const expected = [makeResult("id1", "你好")];
    provider.translate.mockResolvedValue(expected);

    const scheduler = new TranslationScheduler(provider);
    const results = await scheduler.schedule([request]);

    expect(provider.translate).toHaveBeenCalledTimes(1);
    expect(provider.translate).toHaveBeenCalledWith([request]);
    expect(results).toEqual(expected);
  });

  it("retries on failure then succeeds", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);
    const expected = [makeResult("id1", "你好")];

    // First call rejects with a retryable NetworkError; second resolves.
    provider.translate
      .mockRejectedValueOnce(new NetworkError("boom"))
      .mockResolvedValueOnce(expected);

    const scheduler = new TranslationScheduler(provider, {
      baseDelayMs: 100,
      maxRetries: 2,
    });

    // Kick off the schedule; it will be paused on the backoff sleep.
    const promise = scheduler.schedule([request]);

    // Allow the backoff timer (100ms * 2^0 = 100ms) to fire.
    await vi.advanceTimersByTimeAsync(100);

    const results = await promise;

    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(results).toEqual(expected);
  });

  it("does NOT retry on AuthError (rethrows immediately)", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);

    provider.translate.mockImplementationOnce(async () => {
      throw new AuthError("nope");
    });

    const scheduler = new TranslationScheduler(provider, {
      baseDelayMs: 100,
      maxRetries: 3,
    });

    const promise = scheduler.schedule([request]);

    // AuthError is not retryable, so it must reject without any timer
    // advancement. We expect exactly one provider call.
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    expect(provider.translate).toHaveBeenCalledTimes(1);

    // No pending timers should have been scheduled for backoff.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries on NetworkError", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);
    const expected = [makeResult("id1", "你好")];

    provider.translate
      .mockRejectedValueOnce(new NetworkError("first"))
      .mockRejectedValueOnce(new NetworkError("second"))
      .mockResolvedValueOnce(expected);

    const scheduler = new TranslationScheduler(provider, {
      baseDelayMs: 50,
      maxRetries: 3,
    });

    const promise = scheduler.schedule([request]);

    // Backoff schedule: attempt 0 fails -> delay 50ms * 2^0 = 50ms.
    await vi.advanceTimersByTimeAsync(50);
    // attempt 1 fails -> delay 50ms * 2^1 = 100ms.
    await vi.advanceTimersByTimeAsync(100);

    const results = await promise;

    expect(provider.translate).toHaveBeenCalledTimes(3);
    expect(results).toEqual(expected);
  });

  it("respects RateLimitError.retryAfter when computing delay", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);
    const expected = [makeResult("id1", "你好")];

    provider.translate
      .mockRejectedValueOnce(new RateLimitError(30))
      .mockResolvedValueOnce(expected);

    const scheduler = new TranslationScheduler(provider, {
      baseDelayMs: 100,
      maxRetries: 2,
    });

    const promise = scheduler.schedule([request]);

    // retryAfter of 30s means a 30000ms delay, not the exponential 100ms.
    await vi.advanceTimersByTimeAsync(30000);

    const results = await promise;

    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(results).toEqual(expected);
  });

  it("throws after exhausting retries", async () => {
    const provider = new FakeProvider();
    const request = makeRequest("Hello", ["id1"]);

    provider.translate.mockImplementation(async () => {
      throw new NetworkError("always fails");
    });

    const scheduler = new TranslationScheduler(provider, {
      baseDelayMs: 50,
      maxRetries: 2,
    });

    const promise = scheduler.schedule([request]);
    // Attach a no-op rejection handler eagerly so that microtask ordering
    // with fake timers cannot trip Node's unhandled-rejection detector.
    const handled = promise.catch((e) => e);

    // With maxRetries=2, total attempts = 3 (initial + 2 retries).
    // Backoffs: 50ms (after attempt 0), 100ms (after attempt 1).
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);

    const error = await handled;
    expect(error).toBeInstanceOf(NetworkError);
    expect(provider.translate).toHaveBeenCalledTimes(3);
  });
});
