import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ExtractionSchema } from '../extraction/extraction.schema.js';
import type { AiProvider, ExtractionRequest, ExtractionResponse } from './ai-provider.js';
import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT, PROMPT_VERSION } from './prompt.js';

export class RetryableAiError extends Error {}

/** Claude via the official SDK, using structured outputs constrained to the extraction schema. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4096,
        system: [{ type: 'text', text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserPrompt(req) }],
        output_config: { effort: 'low', format: zodOutputFormat(ExtractionSchema) },
      });
      if (response.stop_reason === 'refusal') throw new Error('The AI provider declined to process this input');
      if (response.stop_reason === 'max_tokens') throw new RetryableAiError('AI response was cut off');
      return {
        raw: response.parsed_output,
        provider: this.name,
        model: this.model,
        promptVersion: PROMPT_VERSION,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
        throw new RetryableAiError(`AI provider temporarily unavailable: ${error.message}`);
      }
      throw error;
    }
  }
}
