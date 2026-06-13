export interface TranslationResultProps {
  readonly blockId: string;
  readonly translatedText: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;
}

export class TranslationResult {
  readonly blockId: string;
  readonly translatedText: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;

  constructor(props: TranslationResultProps) {
    this.blockId = props.blockId;
    this.translatedText = props.translatedText;
    this.providerId = props.providerId;
    this.modelId = props.modelId;
    this.latencyMs = props.latencyMs;
  }
}
