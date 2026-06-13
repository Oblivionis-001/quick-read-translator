/**
 * Content-script orchestrator.
 *
 * Two responsibilities, both kept pure-ish so they can be unit-tested:
 *
 *  - selectBlocksForTranslation: pure function that, given the page's
 *    blocks plus the active trigger context (selection text and/or a
 *    hovered block id), returns the subset that should be translated.
 *
 *  - translateBlocks: async function that sends a TRANSLATE_BLOCKS
 *    message to the background script, maps the response back into
 *    TranslationResult domain entities, and renders any per-block
 *    errors via the renderer-adapter. The sendMessage entry point is
 *    a parameter so tests can substitute an in-memory double.
 */

import type { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { renderError } from "./renderer-adapter";

/**
 * Shape of a single result block coming back from the background script.
 * Mirrors the message-handler's TranslateResponseBlock; duplicated here
 * so the content side does not need to import from the background module
 * (the two run in different contexts and should not be coupled).
 */
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
  errors?: TranslateResponseError[];
  /** Top-level error message when ok === false. */
  error?: string;
}

/**
 * Type of the sendMessage entry point we accept. Real callers pass
 * browser.runtime.sendMessage; tests pass an in-memory double. The
 * return type is `unknown` because webextension-polyfill types it
 * loosely; we narrow via the cast inside translateBlocks.
 */
export type SendMessage = (message: unknown) => Promise<unknown>;

/**
 * Decide which blocks a given trigger should translate.
 *
 * Resolution order:
 *  1. If a hoverBlockId is given and matches one of the blocks, return
 *     just that single block. Hover is the most specific intent.
 *  2. Otherwise, if a non-empty selection is given, return every block
 *     whose sourceText contains the selection string.
 *  3. Otherwise (no hover, no selection), fall back to the first block.
 *
 * Returns an empty array when the input list is empty.
 */
export function selectBlocksForTranslation(
  blocks: ParagraphBlock[],
  selection: string | null,
  hoverBlockId: string | null
): ParagraphBlock[] {
  if (blocks.length === 0) return [];

  if (hoverBlockId) {
    const byId = blocks.find((b) => b.id === hoverBlockId);
    if (byId) return [byId];
  }

  if (selection && selection.length > 0) {
    // Case-insensitive substring match: a user who selects "Beta" should
    // also match "beta" / "BETA" in the page text, since the goal is to
    // translate the same passage regardless of typographic case.
    const needle = selection.toLowerCase();
    const matched = blocks.filter((b) => b.sourceText.toLowerCase().includes(needle));
    if (matched.length > 0) return matched;
  }

  return blocks.slice(0, 1);
}

/**
 * Send blocks to the background script for translation, map the response
 * back to TranslationResult entities, and render any per-block errors.
 *
 * Returns an empty array (without sending a message) when blocks is empty,
 * and also when the background reports ok === false.
 */
export async function translateBlocks(
  blocks: ParagraphBlock[],
  targetLanguage: string,
  sendMessage: SendMessage
): Promise<TranslationResult[]> {
  if (blocks.length === 0) return [];

  const response = (await sendMessage({
    type: "TRANSLATE_BLOCKS",
    blocks: blocks.map((b) => ({
      id: b.id,
      sourceText: b.sourceText,
      sourceLanguage: b.sourceLanguage,
      domReference: b.domReference,
    })),
    targetLanguage,
  })) as TranslateResponse;

  if (!response.ok) {
    console.error("[qrt] translation failed:", response.error);
    return [];
  }

  const results = (response.results ?? []).map(
    (r) =>
      new TranslationResult({
        blockId: r.blockId,
        translatedText: r.translatedText,
        providerId: r.providerId,
        modelId: r.modelId,
        latencyMs: r.latencyMs,
      })
  );

  if (response.errors?.length) {
    for (const err of response.errors) {
      renderError(err.blockId, err.message, () => {
        // Retry not wired yet; will be added when scheduler exposes
        // per-block retry.
      });
    }
  }

  return results;
}
