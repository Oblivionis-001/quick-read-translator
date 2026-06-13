import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";

export class DOMBlockExtractor {
  extractFromElement(_root: Element): ParagraphBlock[] {
    throw new Error("not implemented");
  }
}
