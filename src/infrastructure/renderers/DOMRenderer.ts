import { TranslationResult } from "@/domain/entities/TranslationResult";

/**
 * Renders {@link TranslationResult}s back into the page as inline bilingual
 * translations, and shows retry affordances for failed blocks. The renderer
 * is idempotent: re-rendering the same block does not duplicate output, and
 * re-issuing renderError for a block updates the existing marker in place.
 */
export class DOMRenderer {
  private readonly translatedClass = "qrt-translation";
  private readonly errorClass = "qrt-error";

  constructor(private readonly doc: Document = globalThis.document) {}

  render(results: TranslationResult[]): void {
    for (const result of results) {
      const original = this.findOriginalElement(result.blockId);
      if (!original) continue;
      if (original.nextElementSibling?.classList.contains(this.translatedClass)) {
        continue;
      }

      const translationEl = this.doc.createElement("div");
      translationEl.className = this.translatedClass;
      translationEl.textContent = result.translatedText;
      translationEl.style.cssText =
        "color: #928c86; margin-top: 0.25em; margin-bottom: 1em; font-size: 0.95em;";
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
      // Replace any previous retry listener so only the latest onRetry fires.
      const fresh = span.cloneNode(true) as HTMLSpanElement;
      fresh.addEventListener("click", onRetry);
      span.replaceWith(fresh);
      errorEl = fresh;
    }

    errorEl.setAttribute("title", message);
  }

  private findOriginalElement(blockId: string): Element | null {
    return this.doc.querySelector(`[data-qrt-block-id="${blockId}"]`);
  }
}
