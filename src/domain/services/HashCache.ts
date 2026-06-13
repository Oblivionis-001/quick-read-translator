import { sha256 } from "@/shared/utils/hash";

export interface CacheKeyInput {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  modelId: string;
  promptVersion: string;
}

export class HashCache {
  static makeKey(input: CacheKeyInput): string {
    const raw = `${input.sourceText}:${input.sourceLanguage}:${input.targetLanguage}:${input.providerId}:${input.modelId}:${input.promptVersion}`;
    return sha256(raw);
  }
}
