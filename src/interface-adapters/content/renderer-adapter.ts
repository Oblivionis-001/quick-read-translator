/**
 * Renderer adapter: thin module-level singleton wrapper around DOMRenderer.
 *
 * The orchestrator and content entry point call renderResults/renderError
 * without having to manage a DOMRenderer instance themselves. Tests can
 * reset the singleton between cases via _resetRendererForTests to avoid
 * state leakage across unit tests.
 */

import { DOMRenderer } from "@/infrastructure/renderers/DOMRenderer";
import { TranslationResult } from "@/domain/entities/TranslationResult";

let renderer: DOMRenderer | null = null;

function getRenderer(): DOMRenderer {
  if (!renderer) renderer = new DOMRenderer();
  return renderer;
}

export function renderResults(results: TranslationResult[]): void {
  getRenderer().render(results);
}

export function renderError(blockId: string, message: string, onRetry: () => void): void {
  getRenderer().renderError(blockId, message, onRetry);
}

/** Test helper: reset the singleton between tests. */
export function _resetRendererForTests(): void {
  renderer = null;
}
