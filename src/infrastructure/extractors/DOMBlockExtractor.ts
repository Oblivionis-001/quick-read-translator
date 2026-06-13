import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";

export class DOMBlockExtractor {
  private readonly selectors = "p, h1, h2, h3, h4, h5, h6, li";

  extractFromElement(root: Element): ParagraphBlock[] {
    const elements = Array.from(root.querySelectorAll(this.selectors));
    const matchedSet = new Set<Element>(elements);
    const blocks: ParagraphBlock[] = [];

    for (const el of elements) {
      // Skip any element whose ancestor is also in the matched set: the
      // ancestor's extraction already covers this element's text, so
      // emitting a second block would create a duplicate translation.
      if (this.hasMatchedAncestor(el, matchedSet)) continue;

      const text = this.getVisibleText(el);
      if (text.length > 0) {
        blocks.push(
          new ParagraphBlock({
            sourceText: text,
            sourceLanguage: "auto",
            domReference: this.generateDomReference(el),
          })
        );
      }
    }

    return blocks;
  }

  private hasMatchedAncestor(el: Element, matchedSet: Set<Element>): boolean {
    let ancestor = el.parentElement;
    while (ancestor) {
      if (matchedSet.has(ancestor)) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  private getVisibleText(el: Element): string {
    return (el.textContent ?? "").trim().replace(/\s+/g, " ");
  }

  private generateDomReference(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
    return `${tag}-${index}`;
  }
}
