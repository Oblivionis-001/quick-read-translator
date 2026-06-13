import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { ProviderConfig } from "@/shared/types";

export interface TranslationProvider {
  readonly id: string;
  translate(requests: TranslationRequest[]): Promise<TranslationResult[]>;
}

export interface TranslationProviderFactory {
  create(config: ProviderConfig): TranslationProvider;
}