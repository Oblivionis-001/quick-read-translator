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
    const raw = JSON.stringify(input, Object.keys(input).sort());
    return sha256(raw);
  }
}
