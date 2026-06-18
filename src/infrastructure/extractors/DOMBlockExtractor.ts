import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import type { SelectorConfig, SiteRule } from "@/shared/types";
import { mergeSiteRules } from "@/domain/services/SelectorService";

/**
 * Extract ParagraphBlocks from a DOM subtree using a layered
 * SelectorConfig (with optional site-rule deltas applied for the given
 * URL).
 *
 * Algorithm:
 *   1. Merge site rules into the base config.
 *   2. Query the union of `selectors` + `extraBlockSelectors`.
 *   3. Filter out matches in `excludeSelectors` / `excludeTags` /
 *      `stayOriginalSelectors` / `stayOriginalTags`.
 *   4. Apply `blockMinTextCount` filter.
 *   5. Dedupe: skip any element whose ancestor is also in the candidate
 *      set (the ancestor's text already covers this element).
 *   6. Emit one ParagraphBlock per remaining element.
 */
export class DOMBlockExtractor {
  extractFromElement(
    root: Element,
    baseConfig: SelectorConfig,
    siteRules: SiteRule[],
    url: URL
  ): ParagraphBlock[] {
    const config = mergeSiteRules(baseConfig, siteRules, url);

    // Filter out malformed selectors before joining — one bad entry would
    // otherwise make querySelectorAll throw and abort extraction for the
    // whole page.
    const validSelectors = [
      ...config.selectors,
      ...config.extraBlockSelectors,
    ].filter((sel) => this.isQueryableSelector(sel));
    const allSelector = validSelectors.join(", ");
    if (!allSelector) return [];

    const candidates = Array.from(root.querySelectorAll(allSelector));
    const filtered = candidates.filter((el) => this.shouldInclude(el, config));
    const deduped = this.dedupeByAncestor(filtered);

    const blocks: ParagraphBlock[] = [];
    for (const el of deduped) {
      const text = this.getVisibleText(el);
      if (text.length === 0) continue;
      if (text.length < config.blockMinTextCount) continue;
      if (this.wordCount(text) < config.paragraphMinWordCount) continue;
      const block = new ParagraphBlock({
        sourceText: text,
        sourceLanguage: "auto",
        domReference: this.generateDomReference(el),
      });
      // Idempotent within a single extraction pass; re-extraction overwrites
      // previously-assigned IDs. Callers must not cache IDs across calls.
      el.setAttribute("data-qrt-block-id", block.id);
      blocks.push(block);
    }
    return blocks;
  }

  private shouldInclude(el: Element, config: SelectorConfig): boolean {
    const tag = el.tagName.toLowerCase();

    if (config.excludeTags.includes(tag)) return false;
    if (config.stayOriginalTags.includes(tag)) return false;
    for (const sel of config.excludeSelectors) {
      if (this.safeMatches(el, sel)) return false;
    }
    for (const sel of config.stayOriginalSelectors) {
      if (this.safeMatches(el, sel)) return false;
    }
    return true;
  }

  private safeMatches(el: Element, sel: string): boolean {
    try {
      return el.matches(sel);
    } catch {
      // Invalid CSS selector from user config — treat as no match rather
      // than letting the SyntaxError abort extraction for the whole page.
      return false;
    }
  }

  private isQueryableSelector(sel: string): boolean {
    try {
      // `selector` is a live Selector API; compile-throw on invalid input
      // without touching the DOM. Cheaper than throwing on querySelectorAll
      // against a real subtree.
      void this.dummyRoot.matches(sel);
      return true;
    } catch {
      return false;
    }
  }
  private readonly dummyRoot: Element = document.createElement('div');

  private dedupeByAncestor(els: Element[]): Element[] {
    const set = new Set(els);
    return els.filter((el) => {
      let ancestor = el.parentElement;
      while (ancestor) {
        if (set.has(ancestor)) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
  }

  private getVisibleText(el: Element): string {
    return (el.textContent ?? "").trim().replace(/\s+/g, " ");
  }

  private wordCount(text: string): number {
    // Whitespace-split. For CJK text without spaces this returns 1 for
    // any non-empty string, which is the right "skip very short" signal
    // for both western and CJK content.
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateDomReference(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
    return `${tag}-${index}`;
  }
}
