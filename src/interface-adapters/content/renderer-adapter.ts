/**
 * Renderer adapter: thin module-level singleton wrapper around DOMRenderer.
 *
 * The orchestrator and content entry point call renderResults/renderError
 * without having to manage a DOMRenderer instance themselves. The content
 * entry pushes the user-configured theme into the adapter via
 * setRendererTheme; renderResults forwards it to DOMRenderer on every call.
 * Tests can reset the singleton (and theme) between cases via
 * _resetRendererForTests to avoid state leakage across unit tests.
 */

import { DOMRenderer, type LoadingState } from "@/infrastructure/renderers/DOMRenderer";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { TranslationThemeId } from "@/shared/types";

let renderer: DOMRenderer | null = null;
let currentTheme: TranslationThemeId = 'inherit';

function getRenderer(): DOMRenderer {
  if (!renderer) renderer = new DOMRenderer();
  return renderer;
}

export function setRendererTheme(theme: TranslationThemeId): void {
  currentTheme = theme;
}

export function renderResults(results: TranslationResult[]): void {
  getRenderer().render(results, currentTheme);
}

export function renderError(blockId: string, message: string, onRetry: () => void): void {
  getRenderer().renderError(blockId, message, onRetry);
}

/**
 * Show (or update) a per-block loading indicator for each block id in
 * `blockIds`. Forwarded to {@link DOMRenderer.renderLoading}; see there
 * for state semantics.
 */
export function renderLoading(
  blockIds: Iterable<string>,
  state: LoadingState,
  attempt: number,
  maxRetries: number
): void {
  getRenderer().renderLoading(blockIds, state, attempt, maxRetries);
}

/** Test helper: reset the singleton between tests. */
export function _resetRendererForTests(): void {
  renderer = null;
  currentTheme = 'inherit';
}
