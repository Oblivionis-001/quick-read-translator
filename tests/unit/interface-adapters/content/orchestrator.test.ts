import { describe, it, expect, vi } from "vitest";

/**
 * Mock the renderer-adapter so the orchestrator's error-rendering side
 * effect does not touch the real DOM in these tests. Each test can
 * inspect the calls to assert behavior.
 */
vi.mock("@/interface-adapters/content/renderer-adapter", () => ({
  renderResults: vi.fn(),
  renderError: vi.fn(),
}));

import {
  selectBlocksForTranslation,
  translateBlocks,
  type TranslateResponse,
} from "@/interface-adapters/content/orchestrator";
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import * as rendererAdapter from "@/interface-adapters/content/renderer-adapter";

function makeBlock(text: string, sourceLanguage = "auto"): ParagraphBlock {
  return new ParagraphBlock({ sourceText: text, sourceLanguage });
}

describe("selectBlocksForTranslation", () => {
  it("returns the single block matching hoverBlockId when provided", () => {
    const a = makeBlock("Alpha");
    const b = makeBlock("Beta");
    const c = makeBlock("Gamma");
    const selected = selectBlocksForTranslation([a, b, c], null, b.id);
    expect(selected).toEqual([b]);
  });

  it("falls through when hoverBlockId does not match any block", () => {
    const a = makeBlock("Alpha");
    const b = makeBlock("Beta");
    const selected = selectBlocksForTranslation([a, b], null, "nonexistent");
    // No hover match and no selection -> first block.
    expect(selected).toEqual([a]);
  });

  it("returns blocks whose sourceText contains the selection string", () => {
    const a = makeBlock("Alpha beta gamma");
    const b = makeBlock("Delta epsilon");
    const c = makeBlock("Beta zeta");
    const selected = selectBlocksForTranslation([a, b, c], "beta", null);
    expect(selected).toEqual([a, c]);
  });

  it("falls back to first block when selection matches nothing", () => {
    const a = makeBlock("Alpha");
    const b = makeBlock("Beta");
    const selected = selectBlocksForTranslation([a, b], "nomatch", null);
    expect(selected).toEqual([a]);
  });

  it("returns the first block when neither selection nor hoverBlockId is given", () => {
    const a = makeBlock("Alpha");
    const b = makeBlock("Beta");
    const selected = selectBlocksForTranslation([a, b], null, null);
    expect(selected).toEqual([a]);
  });

  it("returns an empty array when given no blocks", () => {
    expect(selectBlocksForTranslation([], null, null)).toEqual([]);
  });

  it("prefers hoverBlockId over selection when both are given", () => {
    const a = makeBlock("Alpha beta");
    const b = makeBlock("Beta gamma");
    const selected = selectBlocksForTranslation([a, b], "beta", b.id);
    expect(selected).toEqual([b]);
  });
});

describe("translateBlocks", () => {
  it("returns an empty array and does not send a message when blocks is empty", async () => {
    const send = vi.fn();
    const results = await translateBlocks([], "zh-CN", send);
    expect(results).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a TRANSLATE_BLOCKS message with mapped block payloads", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      results: [],
    } satisfies TranslateResponse);
    const block = makeBlock("Hello");
    await translateBlocks([block], "zh-CN", send);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![0];
    expect(payload).toEqual({
      type: "TRANSLATE_BLOCKS",
      blocks: [
        {
          id: block.id,
          sourceText: "Hello",
          sourceLanguage: "auto",
          domReference: undefined,
        },
      ],
      targetLanguage: "zh-CN",
    });
  });

  it("maps response results to TranslationResult instances", async () => {
    const block = makeBlock("Hello");
    const send = vi.fn().mockResolvedValue({
      ok: true,
      results: [
        {
          blockId: block.id,
          translatedText: "你好",
          providerId: "glm",
          modelId: "glm-4",
          latencyMs: 42,
        },
      ],
    } satisfies TranslateResponse);
    const results = await translateBlocks([block], "zh-CN", send);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(TranslationResult);
    expect(results[0]).toMatchObject({
      blockId: block.id,
      translatedText: "你好",
      providerId: "glm",
      modelId: "glm-4",
      latencyMs: 42,
    });
  });

  it("returns an empty array when response.ok is false", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: false,
      error: "boom",
    } satisfies TranslateResponse);
    const block = makeBlock("Hello");
    const results = await translateBlocks([block], "zh-CN", send);
    expect(results).toEqual([]);
  });

  it("renders per-block error markers even when response.ok is false", async () => {
    // Regression: when the background populates `errors` on failure, the
    // orchestrator must still surface them with retry buttons rather than
    // silently dropping the whole batch. Without this branch the per-block
    // retry UI is unreachable.
    vi.mocked(rendererAdapter.renderError).mockClear();
    const block = makeBlock("Hello");
    const send = vi.fn().mockResolvedValue({
      ok: false,
      error: "Network failed",
      errors: [{ blockId: block.id, message: "Network failed" }],
    } satisfies TranslateResponse);
    const results = await translateBlocks([block], "zh-CN", send);
    expect(results).toEqual([]);
    expect(rendererAdapter.renderError).toHaveBeenCalledWith(
      block.id,
      "Network failed",
      expect.any(Function)
    );
  });

  it("renders an error marker for each error in the response", async () => {
    const block = makeBlock("Hello");
    const send = vi.fn().mockResolvedValue({
      ok: true,
      results: [],
      errors: [{ blockId: block.id, message: "rate limited" }],
    } satisfies TranslateResponse);
    await translateBlocks([block], "zh-CN", send);
    expect(rendererAdapter.renderError).toHaveBeenCalledWith(
      block.id,
      "rate limited",
      expect.any(Function)
    );
  });

  it("does not call renderError when response has no errors", async () => {
    vi.mocked(rendererAdapter.renderError).mockClear();
    const block = makeBlock("Hello");
    const send = vi.fn().mockResolvedValue({
      ok: true,
      results: [
        {
          blockId: block.id,
          translatedText: "你好",
          providerId: "glm",
          modelId: "glm-4",
          latencyMs: 1,
        },
      ],
    } satisfies TranslateResponse);
    await translateBlocks([block], "zh-CN", send);
    expect(rendererAdapter.renderError).not.toHaveBeenCalled();
  });

  it("wires retry callback to re-translate the failed block when invoked", async () => {
    vi.mocked(rendererAdapter.renderError).mockClear();
    const block = makeBlock("Hello");
    // First call returns an error for the block; the retry's second call
    // succeeds with a translation result.
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        results: [],
        errors: [{ blockId: block.id, message: "rate limited" }],
      } satisfies TranslateResponse)
      .mockResolvedValueOnce({
        ok: true,
        results: [
          {
            blockId: block.id,
            translatedText: "你好",
            providerId: "glm",
            modelId: "glm-4",
            latencyMs: 7,
          },
        ],
      } satisfies TranslateResponse);

    await translateBlocks([block], "zh-CN", send);

    // renderError was called with a retry callback for this block.
    expect(rendererAdapter.renderError).toHaveBeenCalledTimes(1);
    expect(rendererAdapter.renderError).toHaveBeenCalledWith(
      block.id,
      "rate limited",
      expect.any(Function)
    );

    // Only one sendMessage so far (the initial translate).
    expect(send).toHaveBeenCalledTimes(1);

    // Invoke the retry callback captured from renderError.
    const retryCallback = vi.mocked(rendererAdapter.renderError).mock.calls[0]![2];
    expect(typeof retryCallback).toBe("function");
    await retryCallback();

    // Retry should have sent a second TRANSLATE_BLOCKS message
    // containing only the failed block.
    expect(send).toHaveBeenCalledTimes(2);
    const retryPayload = send.mock.calls[1]![0];
    expect(retryPayload).toEqual({
      type: "TRANSLATE_BLOCKS",
      blocks: [
        {
          id: block.id,
          sourceText: "Hello",
          sourceLanguage: "auto",
          domReference: undefined,
        },
      ],
      targetLanguage: "zh-CN",
    });
  });
});
