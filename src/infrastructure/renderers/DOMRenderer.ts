import { TranslationResult } from "@/domain/entities/TranslationResult";

export class DOMRenderer {
  constructor(private readonly doc: Document = globalThis.document) {}

  render(_results: TranslationResult[]): void {
    throw new Error("not implemented");
  }

  renderError(_blockId: string, _message: string, _onRetry: () => void): void {
    throw new Error("not implemented");
  }
}
