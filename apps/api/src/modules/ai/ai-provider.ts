export interface ExtractionRequest {
  /** Normalized user input. Treated as untrusted data. */
  text: string;
  /** Capture time in the user's timezone, e.g. "Saturday, 8 November 2026, 10:30" — lets the model read "yesterday". */
  capturedAtLocal: string;
  timeZone: string;
  sourceKind: 'TEXT' | 'PASTE' | 'SCREENSHOT' | 'VOICE';
  /** Voice note spoken in Hindi/Hinglish and translated to English by the transcriber. */
  translated?: boolean;
}

export interface ExtractionResponse {
  /** Unvalidated JSON from the provider. The caller validates it with Zod. */
  raw: unknown;
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface AiProvider {
  readonly name: string;
  extract(req: ExtractionRequest): Promise<ExtractionResponse>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
