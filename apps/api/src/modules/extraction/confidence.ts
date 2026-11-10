import type { ValidationResult } from './validate.js';

/**
 * Explainable confidence heuristic (NOT a calibrated probability).
 * The model's own opinion of its confidence is deliberately ignored.
 */
export const SCORING_VERSION = 'v1';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfidenceFactor {
  key: string;
  label: string;
  weight: number;
  value: number; // 0..1
  detail: string;
}

export interface Confidence {
  score: number;
  band: ConfidenceBand;
  factors: ConfidenceFactor[];
}

export interface SourceInfo {
  kind: 'TEXT' | 'PASTE' | 'SCREENSHOT' | 'VOICE';
  ocrConfidence?: number | null; // 0..100
  length: number;
}

export function scoreConfidence(v: ValidationResult, source: SourceInfo): Confidence {
  const p = v.proposed;
  const actionable = p.isCommitment && p.classification !== 'INFORMATIONAL' && p.classification !== 'UNCERTAIN';
  const hasSupport = Boolean(p.lifecycleEvidence || p.counterparty || p.nextAction?.evidence);

  const commitment = actionable ? (hasSupport ? 1 : 0.5) : 0;
  const responsibility =
    p.waitingOn === 'UNKNOWN' ? 0 : p.counterparty || (p.waitingOn === 'USER' && p.nextAction?.evidence) ? 1 : 0.5;
  const status = p.lifecycleStage ? 1 : 0;
  const integrity = v.stripped.length === 0 ? 1 : Math.max(0, 1 - 0.5 * v.stripped.length);

  let quality = 1;
  if (source.kind === 'SCREENSHOT') quality = Math.min(1, Math.max(0, (source.ocrConfidence ?? 50) / 100));
  if (source.kind === 'VOICE') quality = 0.8; // transcription can mishear names and numbers
  if (source.length < 30) quality *= 0.5;

  const specifics = Math.min(1, (p.amount ? 0.4 : 0) + (p.identifiers.length ? 0.4 : 0) + (p.deadline || p.eventDate ? 0.2 : 0));

  const factors: ConfidenceFactor[] = [
    { key: 'commitment', label: 'Clear pending commitment', weight: 0.3, value: commitment, detail: actionable ? (hasSupport ? 'Backed by text' : 'Weak supporting text') : 'Not an open commitment' },
    { key: 'responsibility', label: 'Clear who is responsible', weight: 0.15, value: responsibility, detail: p.waitingOn === 'UNKNOWN' ? 'Unknown who acts next' : p.counterparty ? `Waiting on ${p.counterparty.name}` : p.waitingOn === 'USER' ? 'You need to act' : 'Party not named' },
    { key: 'status', label: 'Explicit status', weight: 0.15, value: status, detail: p.lifecycleStage ?? 'No explicit status' },
    { key: 'integrity', label: 'Evidence checks', weight: 0.2, value: integrity, detail: v.stripped.length ? `${v.stripped.length} unsupported value(s) removed` : 'Every value found in the text' },
    { key: 'quality', label: 'Source quality', weight: 0.1, value: quality, detail: source.kind === 'SCREENSHOT' ? `OCR confidence ${Math.round(source.ocrConfidence ?? 0)}%` : source.kind === 'VOICE' ? 'Voice note (transcribed)' : source.length < 30 ? 'Very short input' : 'Typed text' },
    { key: 'specifics', label: 'Specific details', weight: 0.1, value: specifics, detail: [p.amount && 'amount', p.identifiers.length && 'reference', (p.deadline || p.eventDate) && 'date'].filter(Boolean).join(', ') || 'None' },
  ];

  let score = factors.reduce((sum, f) => sum + f.weight * f.value, 0);
  score -= 0.1 * v.contradictions.length;
  score = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  const band: ConfidenceBand = score >= 0.75 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW';
  return { score, band, factors };
}
