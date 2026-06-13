import { sha256 } from "@/shared/utils/hash";

export interface ParagraphBlockProps {
  readonly sourceText: string;
  readonly sourceLanguage: string;
  readonly domReference?: string;
  readonly contextBlocks?: ParagraphBlock[];
}

export class ParagraphBlock {
  readonly id: string;
  readonly sourceText: string;
  readonly sourceLanguage: string;
  readonly domReference?: string;
  readonly contextBlocks: ParagraphBlock[];

  constructor(props: ParagraphBlockProps) {
    this.id = sha256(`${props.sourceText}:${props.sourceLanguage}`);
    this.sourceText = props.sourceText;
    this.sourceLanguage = props.sourceLanguage;
    this.domReference = props.domReference;
    this.contextBlocks = props.contextBlocks ?? [];
  }
}
