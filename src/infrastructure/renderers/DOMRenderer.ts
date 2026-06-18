import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { TranslationThemeId } from "@/shared/types";
import { getTheme } from "@/domain/services/ThemeCatalog";

/** Visual state of a per-block loading indicator. */
export type LoadingState = "translating" | "retrying";

/** Stylesheet injected once per document so loading spinners animate. */
const LOADING_STYLE_ID = "qrt-loading-style";
const LOADING_STYLE_TEXT = `
@keyframes qrt-spin { to { transform: rotate(360deg); } }
.qrt-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.25em;
  margin-bottom: 0.5em;
  font-size: 0.85em;
  color: #6b7280;
}
.qrt-loading-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #d1d5db;
  border-top-color: #00a071;
  border-radius: 50%;
  animation: qrt-spin 0.8s linear infinite;
  flex-shrink: 0;
}
`;

/**
 * Renders {@link TranslationResult}s back into the page as inline bilingual
 * translations, and shows retry affordances for failed blocks. Re-rendering
 * a block does not duplicate output: when a translation sibling already
 * exists, its text and theme are updated in place.
 *
 * Per-block loading indicators ({@link renderLoading}) are inserted
 * alongside the original during translation / retry, and are cleared
 * automatically by {@link render} and {@link renderError} when the
 * terminal state for that block arrives.
 */
export class DOMRenderer {
  private readonly translatedClass = "qrt-translation";
  private readonly errorClass = "qrt-error";
  private readonly loadingClass = "qrt-loading";

  constructor(private readonly doc: Document = globalThis.document) {}

  render(results: TranslationResult[], theme: TranslationThemeId = 'inherit'): void {
    for (const result of results) {
      const original = this.findOriginalElement(result.blockId);
      if (!original) continue;
      this.clearLoading(original);
      const existing = original.nextElementSibling;
      if (existing?.classList.contains(this.translatedClass)) {
        const el = existing as HTMLElement;
        el.textContent = result.translatedText;
        this.applyTheme(el, original, theme);
        continue;
      }

      const translationEl = this.doc.createElement("div");
      translationEl.className = this.translatedClass;
      translationEl.textContent = result.translatedText;
      this.applyTheme(translationEl, original, theme);
      original.after(translationEl);
    }
  }

  renderError(blockId: string, message: string, onRetry: () => void): void {
    const original = this.findOriginalElement(blockId);
    if (!original) return;
    this.clearLoading(original);

    let errorEl = original.nextElementSibling;
    if (!errorEl || !errorEl.classList.contains(this.errorClass)) {
      const span = this.doc.createElement("span");
      span.className = this.errorClass;
      span.textContent = " ⚠️";
      span.style.cursor = "pointer";
      span.addEventListener("click", onRetry);
      original.after(span);
      errorEl = span;
    } else {
      const span = errorEl as HTMLSpanElement;
      const fresh = span.cloneNode(true) as HTMLSpanElement;
      fresh.addEventListener("click", onRetry);
      span.replaceWith(fresh);
      errorEl = fresh;
    }

    errorEl.setAttribute("title", message);
  }

  /**
   * Show (or update) a per-block loading indicator for each block id in
   * `blockIds`. State transitions re-use the existing indicator if one is
   * already present so the spinner doesn't flicker between attempts.
   *
   * `state='translating'` is the initial fetch (attempt 0); show a generic
   * "翻译中" label. `state='retrying'` is a backoff retry and surfaces
   * which retry is in flight (attempt/maxRetries).
   */
  renderLoading(
    blockIds: Iterable<string>,
    state: LoadingState,
    attempt: number,
    maxRetries: number
  ): void {
    this.ensureLoadingStyle();
    for (const blockId of blockIds) {
      const original = this.findOriginalElement(blockId);
      if (!original) continue;

      let loading = original.nextElementSibling;
      if (!loading || !loading.classList.contains(this.loadingClass)) {
        loading = this.createLoadingElement();
        original.after(loading);
      }
      const textEl = loading.querySelector(".qrt-loading-text");
      if (textEl) {
        textEl.textContent =
          state === "retrying"
            ? `重试中 (${attempt}/${maxRetries})…`
            : "翻译中…";
      }
    }
  }

  private createLoadingElement(): HTMLElement {
    const wrapper = this.doc.createElement("div");
    wrapper.className = this.loadingClass;
    const spinner = this.doc.createElement("span");
    spinner.className = "qrt-loading-spinner";
    const text = this.doc.createElement("span");
    text.className = "qrt-loading-text";
    wrapper.appendChild(spinner);
    wrapper.appendChild(text);
    return wrapper;
  }

  /**
   * Remove the loading indicator immediately following `original`, if any.
   * Called from {@link render} and {@link renderError} so the spinner
   * disappears the moment the terminal state arrives.
   */
  private clearLoading(original: Element): void {
    const next = original.nextElementSibling;
    if (next?.classList.contains(this.loadingClass)) {
      next.remove();
    }
  }

  /**
   * Inject the loading stylesheet once per document. Idempotent: a
   * pre-existing `<style data-qrt-loading-style>` short-circuits the
   * injection.
   */
  private ensureLoadingStyle(): void {
    if (this.doc.querySelector(`style[data-qrt-loading-style]`)) return;
    const style = this.doc.createElement("style");
    style.setAttribute("data-qrt-loading-style", "");
    style.textContent = LOADING_STYLE_TEXT;
    this.doc.head.appendChild(style);
  }

  /**
   * Apply the given theme to a translation element. Shared layout (block
   * display, top/bottom margins separating the translation from the
   * original) is always applied; theme-specific styling is layered on top.
   *
   * For `inherit`, we explicitly copy computed style from the original
   * element. The translation is a sibling (not a child), so natural CSS
   * cascade would inherit from the original's parent — which is rarely
   * what the user wants. Explicit copy preserves the original's visual
   * weight: an h1's translation is also h1-sized.
   */
  private applyTheme(
    el: HTMLElement,
    original: Element,
    theme: TranslationThemeId
  ): void {
    // Reset to a known baseline so theme switches don't leave residual
    // styles from the previous theme.
    el.style.cssText = '';
    el.style.display = 'block';
    el.style.marginTop = '0.25em';
    el.style.marginBottom = '0.5em';

    if (theme === 'inherit') {
      const win = this.doc.defaultView;
      if (!win) return;
      const cs = win.getComputedStyle(original);
      el.style.color = cs.color;
      el.style.fontSize = cs.fontSize;
      el.style.fontFamily = cs.fontFamily;
      el.style.fontWeight = cs.fontWeight;
      el.style.lineHeight = cs.lineHeight;
      el.style.letterSpacing = cs.letterSpacing;
      el.style.textAlign = cs.textAlign;
    } else {
      const def = getTheme(theme);
      if (def && def.cssText) {
        el.style.cssText += def.cssText;
      }
    }
  }

  private findOriginalElement(blockId: string): Element | null {
    return this.doc.querySelector(`[data-qrt-block-id="${blockId}"]`);
  }
}
