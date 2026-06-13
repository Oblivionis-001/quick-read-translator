import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { ProviderConfig } from "@/shared/types";
import {
  AuthError,
  ProviderError,
  RateLimitError,
  ValidationError,
} from "@/domain/errors";

export class OpenAICompatibleProvider implements TranslationProvider {
  readonly id: string;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  async translate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const request of requests) {
      const startTime = performance.now();

      const systemPrompt = this.config.systemPrompt.replace(
        /\{\{targetLanguage\}\}/g,
        request.targetLanguage
      );
      const userPrompt = this.config.userPromptTemplate
        .replace(/\{\{text\}\}/g, request.combinedText)
        .replace(/\{\{targetLanguage\}\}/g, request.targetLanguage);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      const data = await response.json();
      const content: unknown = data?.choices?.[0]?.message?.content;

      if (typeof content !== "string") {
        throw new ValidationError();
      }

      const lines = content.split("\n");
      request.blockIds.forEach((blockId, index) => {
        results.push(
          new TranslationResult({
            blockId,
            translatedText: lines[index] ?? content,
            providerId: this.id,
            modelId: this.config.model,
            latencyMs,
          })
        );
      });
    }

    return results;
  }

  private async mapHttpError(
    response: Response
  ): Promise<AuthError | RateLimitError | ProviderError> {
    const status = response.status;

    if (status === 401 || status === 403) {
      return new AuthError();
    }

    if (status === 429) {
      const retryAfterHeader = response.headers?.get("retry-after");
      const retryAfter = retryAfterHeader
        ? Number(retryAfterHeader)
        : undefined;
      return new RateLimitError(
        Number.isFinite(retryAfter) ? (retryAfter as number) : undefined
      );
    }

    if (status >= 500 && status < 600) {
      return new ProviderError(status, `Server error: ${status}`);
    }

    return new ProviderError(status, `Provider error: ${status}`);
  }
}
