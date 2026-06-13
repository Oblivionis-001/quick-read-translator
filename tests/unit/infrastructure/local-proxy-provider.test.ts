import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalProxyProvider } from "@/infrastructure/providers/LocalProxyProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import {
  NetworkError,
  ProviderError,
  ValidationError,
} from "@/domain/errors";

describe("LocalProxyProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeProvider(
    opts: Partial<{ id: string; proxyUrl: string; fetchImpl: typeof fetch }> = {}
  ): LocalProxyProvider {
    return new LocalProxyProvider({
      id: opts.id ?? "local-proxy",
      proxyUrl: opts.proxyUrl ?? "http://127.0.0.1:8787",
      fetchImpl: opts.fetchImpl ?? (fetchMock as unknown as typeof fetch),
    });
  }

  function makeRequest(overrides: Partial<{
    blockIds: string[];
    combinedText: string;
    targetLanguage: string;
    sourceLanguage: string;
    context: string;
  }> = {}): TranslationRequest {
    return new TranslationRequest({
      blockIds: overrides.blockIds ?? ["b1"],
      combinedText: overrides.combinedText ?? "Hello",
      targetLanguage: overrides.targetLanguage ?? "zh",
      sourceLanguage: overrides.sourceLanguage,
      context: overrides.context,
    });
  }

  function okResponse(results: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => ({ results }),
    } as Response;
  }

  it("sets id from constructor config", () => {
    const provider = makeProvider({ id: "custom-proxy" });
    expect(provider.id).toBe("custom-proxy");
  });

  it("POSTs to ${proxyUrl}/translate and returns the results array on happy path", async () => {
    fetchMock.mockResolvedValue(
      okResponse([
        {
          blockId: "b1",
          translatedText: "你好",
          providerId: "local-proxy",
          modelId: "some-model",
          latencyMs: 42,
        },
      ])
    );

    const provider = makeProvider({ proxyUrl: "http://127.0.0.1:8787" });
    const results = await provider.translate([makeRequest()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/translate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(results).toHaveLength(1);
    expect(results[0].blockId).toBe("b1");
    expect(results[0].translatedText).toBe("你好");
    expect(results[0].providerId).toBe("local-proxy");
    expect(results[0].modelId).toBe("some-model");
    expect(results[0].latencyMs).toBe(42);
  });

  it("trims trailing slash from proxyUrl", async () => {
    fetchMock.mockResolvedValue(okResponse([]));

    const provider = makeProvider({ proxyUrl: "http://127.0.0.1:8787/" });
    await provider.translate([makeRequest()]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/translate",
      expect.anything()
    );
  });

  it("serializes request fields into the POST body", async () => {
    fetchMock.mockResolvedValue(okResponse([]));

    const provider = makeProvider();
    await provider.translate([
      makeRequest({
        blockIds: ["b1", "b2"],
        combinedText: "Hello\nWorld",
        targetLanguage: "ja",
        sourceLanguage: "en",
        context: "greeting",
      }),
    ]);

    const callArgs = fetchMock.mock.calls[0][1] as {
      body: string;
    };
    const body = JSON.parse(callArgs.body);

    expect(body).toEqual({
      blockIds: ["b1", "b2"],
      combinedText: "Hello\nWorld",
      targetLanguage: "ja",
      sourceLanguage: "en",
      context: "greeting",
    });
  });

  it("wraps fetch network failures in NetworkError", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const provider = makeProvider();
    await expect(provider.translate([makeRequest()])).rejects.toThrow(
      NetworkError
    );
  });

  it("throws ProviderError on non-ok HTTP response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const provider = makeProvider();
    await expect(provider.translate([makeRequest()])).rejects.toThrow(
      ProviderError
    );
  });

  it("throws ValidationError when results is missing from response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const provider = makeProvider();
    await expect(provider.translate([makeRequest()])).rejects.toThrow(
      ValidationError
    );
  });

  it("throws ValidationError when results contains a malformed entry", async () => {
    fetchMock.mockResolvedValue(
      okResponse([
        {
          blockId: "b1",
          // missing translatedText, providerId, modelId, latencyMs
        },
      ])
    );

    const provider = makeProvider();
    await expect(provider.translate([makeRequest()])).rejects.toThrow(
      ValidationError
    );
  });

  it("issues a separate POST for each request and concatenates the results", async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse([
          {
            blockId: "b1",
            translatedText: "你好",
            providerId: "local-proxy",
            modelId: "m",
            latencyMs: 10,
          },
        ])
      )
      .mockResolvedValueOnce(
        okResponse([
          {
            blockId: "b2",
            translatedText: "世界",
            providerId: "local-proxy",
            modelId: "m",
            latencyMs: 20,
          },
          {
            blockId: "b3",
            translatedText: "！",
            providerId: "local-proxy",
            modelId: "m",
            latencyMs: 30,
          },
        ])
      );

    const provider = makeProvider();
    const results = await provider.translate([
      makeRequest({ blockIds: ["b1"], combinedText: "Hello" }),
      makeRequest({ blockIds: ["b2", "b3"], combinedText: "World\n!" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.blockId)).toEqual(["b1", "b2", "b3"]);
    expect(results.map((r) => r.translatedText)).toEqual([
      "你好",
      "世界",
      "！",
    ]);
  });
});
