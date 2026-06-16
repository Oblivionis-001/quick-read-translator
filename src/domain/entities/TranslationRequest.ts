export interface TranslationRequestProps {
  readonly blockIds: string[];
  readonly combinedText: string;
  readonly targetLanguage: string;
  readonly sourceLanguage?: string;
  readonly context?: string;
}

export class TranslationRequest {
  readonly blockIds: string[];
  readonly combinedText: string;
  readonly targetLanguage: string;
  readonly sourceLanguage: string;
  readonly context?: string;

  constructor(props: TranslationRequestProps) {
    this.blockIds = props.blockIds;
    this.combinedText = props.combinedText;
    this.targetLanguage = props.targetLanguage;
    this.sourceLanguage = props.sourceLanguage ?? "auto";
    this.context = props.context;
  }
}
