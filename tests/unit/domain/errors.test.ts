import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { ProviderConfig } from "@/shared/types";
import {
  AuthError,
  NetworkError,
  ProviderError,
  RateLimitError,
  TranslationError,
  ValidationError,
} from "@/domain/errors";

const testConfig: ProviderConfig = {
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-api-key",
  model: "gpt-4",
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt: "Translate to {{targetLanguage}}.",
  userPromptTemplate: "Translate: {{text}} to {{targetLanguage}}",
  enabled: true,
};

function makeRequest(): TranslationRequest {
  return new TranslationRequest({
    blockIds: ["id1"],
    combinedText: "Hello",
    targetLanguage: "zh",
  });
}

describe("Domain error types", () => {
  describe("Error class hierarchy", () => {
    it("TranslationError is the base of all domain errors", () => {
      expect(new NetworkError()).toBeInstanceOf(TranslationError);
      expect(new AuthError()).toBeInstanceOf(TranslationError);
      expect(new RateLimitError()).toBeInstanceOf(TranslationError);
      expect(new ProviderError(500, "Server error: 500")).toBeInstanceOf(
        TranslationError
      );
      expect(new ValidationError()).toBeInstanceOf(TranslationError);
    });

    it("extends Error", () => {
      expect(new TranslationError("base")).toBeInstanceOf(Error);
    });

    it("uses default message for NetworkError", () => {
      expect(new NetworkError().message).toBe("Network error");
    });

    it("uses default message for AuthError", () => {
      expect(new AuthError().message).toBe("Authentication failed");
    });

    it("uses default message for ValidationError", () => {
      expect(new ValidationError().message).toBe("Invalid response");
    });

    it("RateLimitError defaults to 'Rate limit exceeded' and retryAfter undefined", () => {
      const err = new RateLimitError();
      expect(err.message).toBe("Rate limit exceeded");
      expect(err.retryAfter).toBeUndefined();
    });

    it("RateLimitError accepts a retryAfter value", () => {
      const err = new RateLimitError(42);
      expect(err.retryAfter).toBe(42);
    });

    it("ProviderError stores status code and message", () => {
      const err = new ProviderError(500, "Server error: 500");
      expect(err.status).toBe(500);
      expect(err.message).toBe("Server error: 500");
    });
  });
});

describe("OpenAICompatibleProvider error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws AuthError on 401 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => "unauthorized",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(provider.translate([makeRequest()])).rejects.toBeInstanceOf(
      AuthError
    );
  });

  it("throws AuthError on 403 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => "forbidden",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(provider.translate([makeRequest()])).rejects.toBeInstanceOf(
      AuthError
    );
  });

  it("throws RateLimitError with retryAfter from header on 429", async () => {
    const headers = new Headers();
    headers.set("retry-after", "30");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers,
        text: async () => "slow down",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
      message: "Rate limit exceeded",
      retryAfter: 30,
    });
    await expect(
      provider.translate([makeRequest()])
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws RateLimitError without retryAfter when header missing on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => "slow down",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(
      provider.translate([makeRequest()])
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws ProviderError with 'Server error' message on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        text: async () => "service unavailable",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
      status: 503,
      message: "Server error: 503",
    });
  });

  it("throws ProviderError with 'Provider error' message on other non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 418,
        headers: new Headers(),
        text: async () => "im a teapot",
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(provider.translate([makeRequest()])).rejects.toMatchObject({
      status: 418,
      message: "Provider error: 418",
    });
  });

  it("throws ValidationError when content is missing in response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: {} }],
        }),
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(
      provider.translate([makeRequest()])
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when content is not a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: { nested: "object" } } }],
        }),
      })
    );

    const provider = new OpenAICompatibleProvider(testConfig);

    await expect(
      provider.translate([makeRequest()])
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
