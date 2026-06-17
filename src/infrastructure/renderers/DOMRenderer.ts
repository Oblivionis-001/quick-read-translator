import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { TranslationThemeId } from "@/shared/types";
import { getTheme } from "@/domain/services/ThemeCatalog";

/**
 * Renders {@link TranslationResult}s back into the page as inline bilingual
 * translations, and shows retry affordances for failed blocks. Re-rendering
 * a block does not duplicate output: when a translation sibling already
 * exists, its text and theme are updated in place.
 */
export class DOMRenderer {
  private readonly translatedClass = "qrt-translation";
  private readonly errorClass = "qrt-error";

  constructor(private readonly doc: Document = globalThis.document) {}

  render(results: TranslationResult[], theme: TranslationThemeId = 'inherit'): void {
    for (const result of results) {
      const original = this.findOriginalElement(result.blockId);
      if (!original) continue;
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
