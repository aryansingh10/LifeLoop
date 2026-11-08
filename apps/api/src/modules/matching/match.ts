import type { ProposedCase } from '../extraction/validate.js';
import { tokenJaccard } from '../extraction/text.js';

/**
 * Deterministic case matching. Only the user ever merges; this produces ranked candidates.
 *   STRONG  - same reference/order/ticket number, no conflicting identifier
 *   MEDIUM  - same counterparty and (same amount or same category), case still active
 *   WEAK    - context only (never pre-selected)
 * A conflicting identifier of the same kind rules a case out, whatever else matches.
 */
export type MatchStrength = 'STRONG' | 'MEDIUM' | 'WEAK';

export interface CandidateCase {
  id: string;
  title: string;
  category: string;
  status: string;
  counterpartyNormalized: string | null;
  amountMinor: number | null;
  updatedAt: Date;
  identifiers: Array<{ kind: string; valueNormalized: string }>;
}

export interface MatchCandidate {
  caseId: string;
  score: number;
  strength: MatchStrength;
  reasons: string[];
}

export interface MatchResult {
  candidates: MatchCandidate[];
  /** Set only when exactly one case is clearly the best match. */
  targetCaseId: string | null;
  ambiguous: boolean;
}

const ACTIVE = new Set(['OPEN', 'SNOOZED']);
const DAY = 24 * 3600 * 1000;

function sameCounterparty(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(long);
}

export function scoreCandidate(p: ProposedCase, c: CandidateCase, now: Date): MatchCandidate | null {
  const reasons: string[] = [];
  let score = 0;

  const caseIds = new Set(c.identifiers.map((i) => i.valueNormalized));
  const refMatch = p.identifiers.some((i) => caseIds.has(i.normalized));
  const conflict =
    !refMatch &&
    p.identifiers.some((pi) => {
      const sameKind = c.identifiers.filter((ci) => ci.kind === pi.kind);
      return sameKind.length > 0 && !sameKind.some((ci) => ci.valueNormalized === pi.normalized);
    });

  if (refMatch) {
    score += 0.6;
    reasons.push('Same reference number');
  }
  if (conflict) {
    score -= 1;
    reasons.push('Different reference number');
  }
  const party = sameCounterparty(p.counterparty?.normalized, c.counterpartyNormalized);
  if (party) {
    score += 0.2;
    reasons.push('Same company/person');
  }
  const amount = p.amount != null && c.amountMinor != null && p.amount.amountMinor === c.amountMinor;
  if (amount) {
    score += 0.15;
    reasons.push('Same amount');
  }
  const category = p.category != null && p.category === c.category;
  if (category) {
    score += 0.05;
    reasons.push('Same category');
  }
  if (now.getTime() - c.updatedAt.getTime() <= 60 * DAY) score += 0.05;
  if (tokenJaccard(p.title, c.title) >= 0.3) {
    score += 0.05;
    reasons.push('Similar title');
  }

  let strength: MatchStrength | null = null;
  if (refMatch && !conflict) strength = 'STRONG';
  else if (!conflict && party && (amount || category) && ACTIVE.has(c.status)) strength = 'MEDIUM';
  else if (!conflict && score >= 0.25 && (party || reasons.includes('Similar title'))) strength = 'WEAK';
  if (!strength) return null;

  return { caseId: c.id, score: Math.round(score * 100) / 100, strength, reasons };
}

export function matchCases(p: ProposedCase, cases: CandidateCase[], now: Date = new Date()): MatchResult {
  const candidates = cases
    .map((c) => scoreCandidate(p, c, now))
    .filter((x): x is MatchCandidate => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const strong = candidates.filter((c) => c.strength === 'STRONG');
  const medium = candidates.filter((c) => c.strength === 'MEDIUM');
  if (strong.length === 1) return { candidates, targetCaseId: strong[0].caseId, ambiguous: false };
  if (strong.length > 1) return { candidates, targetCaseId: null, ambiguous: true };
  if (medium.length === 1) return { candidates, targetCaseId: medium[0].caseId, ambiguous: false };
  return { candidates, targetCaseId: null, ambiguous: medium.length > 1 };
}
