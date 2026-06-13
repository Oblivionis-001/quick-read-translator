import { TranslationProvider } from "@/domain/interfaces/TranslationProvider";
import { TranslationRequest } from "@/domain/entities/TranslationRequest";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import { ProviderConfig } from "@/shared/types";

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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";

      const lines = content.split("\n");
      const blockId = request.blockIds[0] ?? "";

      const translatedText = lines.length >= request.blockIds.length
        ? content
        : content;

      results.push(
        new TranslationResult({
          blockId,
          translatedText,
          providerId: this.config.id,
          modelId: this.config.model,
          latencyMs,
        })
      );
    }

    return results;
  }
}
