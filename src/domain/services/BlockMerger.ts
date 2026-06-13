import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";

export interface BlockMergerOptions {
  maxTokens: number;
  tokensPerChar?: number;
}

export class BlockMerger {
  private readonly maxTokens: number;
  private readonly tokensPerChar: number;

  constructor(options: BlockMergerOptions) {
    this.maxTokens = options.maxTokens;
    this.tokensPerChar = options.tokensPerChar ?? 0.5;
  }

  merge(blocks: ParagraphBlock[], targetLanguage: string): TranslationRequest[] {
    const requests: TranslationRequest[] = [];
    let currentBatch: ParagraphBlock[] = [];
    let currentTokens = 0;

    for (const block of blocks) {
      const blockTokens = Math.ceil(block.sourceText.length * this.tokensPerChar);

      if (blockTokens > this.maxTokens) {
        if (currentBatch.length > 0) {
          requests.push(this.createRequest(currentBatch, targetLanguage));
          currentBatch = [];
          currentTokens = 0;
        }
        requests.push(this.createRequest([block], targetLanguage));
        continue;
      }

      if (currentTokens + blockTokens > this.maxTokens && currentBatch.length > 0) {
        requests.push(this.createRequest(currentBatch, targetLanguage));
        currentBatch = [];
        currentTokens = 0;
      }

      currentBatch.push(block);
      currentTokens += blockTokens;
    }

    if (currentBatch.length > 0) {
      requests.push(this.createRequest(currentBatch, targetLanguage));
    }

    return requests;
  }

  private createRequest(batch: ParagraphBlock[], targetLanguage: string): TranslationRequest {
    return new TranslationRequest({
      blockIds: batch.map((b) => b.id),
      combinedText: batch.map((b) => b.sourceText).join("\n"),
      targetLanguage,
      sourceLanguage: batch[0].sourceLanguage,
    });
  }
}
