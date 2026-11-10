import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, type AiProvider, type ExtractionResponse } from '../ai/ai-provider.js';
import { scoreConfidence, type Confidence } from './confidence.js';
import { ExtractionSchema } from './extraction.schema.js';
import { validateExtraction, type ValidationResult } from './validate.js';

export interface ExtractionInput {
  text: string;
  capturedAt: Date;
  timeZone: string;
  sourceKind: 'TEXT' | 'PASTE' | 'SCREENSHOT' | 'VOICE';
  ocrConfidence?: number | null;
  translated?: boolean;
}

export type ExtractionOutcome =
  | { ok: true; response: ExtractionResponse; validation: ValidationResult; confidence: Confidence; latencyMs: number }
  | { ok: false; response: ExtractionResponse; schemaErrors: string[]; latencyMs: number };

function formatLocal(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(date);
}

/** Provider call -> schema validation -> evidence/date/amount validation -> confidence. */
@Injectable()
export class ExtractionService {
  constructor(@Inject(AI_PROVIDER) private readonly ai: AiProvider) {}

  get providerName(): string {
    return this.ai.name;
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutcome> {
    const started = Date.now();
    const request = {
      text: input.text,
      capturedAtLocal: formatLocal(input.capturedAt, input.timeZone),
      timeZone: input.timeZone,
      sourceKind: input.sourceKind,
      translated: input.translated,
    };

    // One repair attempt if the output does not match the schema.
    let response = await this.ai.extract(request);
    let parsed = ExtractionSchema.safeParse(response.raw);
    if (!parsed.success) {
      response = await this.ai.extract(request);
      parsed = ExtractionSchema.safeParse(response.raw);
    }
    if (!parsed.success) {
      return {
        ok: false,
        response,
        schemaErrors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        latencyMs: Date.now() - started,
      };
    }

    const validation = validateExtraction(parsed.data, {
      source: input.text,
      capturedAt: input.capturedAt,
      timeZone: input.timeZone,
    });
    const confidence = scoreConfidence(validation, {
      kind: input.sourceKind,
      ocrConfidence: input.ocrConfidence,
      length: input.text.length,
    });
    return { ok: true, response, validation, confidence, latencyMs: Date.now() - started };
  }
}
