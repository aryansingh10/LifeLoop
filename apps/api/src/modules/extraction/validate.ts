import {
  COMPLETED_STAGES,
  type Category,
  type Classification,
  type Extraction,
  type WaitingOn,
} from './extraction.schema.js';
import { followUpAfter, isDurationExpression, resolveDeadline, resolveEventDate } from './dates.js';
import { formatMoney, parseMoney } from './money.js';
import { foldForCompare, normalizeCounterparty, normalizeIdentifier, tokens } from './text.js';

/** What a suggestion proposes after validation. Only verified values survive. */
export interface ProposedCase {
  isCommitment: boolean;
  classification: Classification;
  category: Category | null;
  lifecycleStage: string | null;
  lifecycleEvidence: string | null;
  title: string;
  summary: string | null;
  waitingOn: WaitingOn;
  counterparty: { name: string; normalized: string; evidence: string } | null;
  nextAction: { text: string; evidence: string | null } | null;
  deadline: { at: string; kind: 'EXPLICIT' | 'ESTIMATED'; expression: string; evidence: string } | null;
  amount: { amountMinor: number; currency: string | null; display: string; evidence: string } | null;
  identifiers: Array<{ kind: string; value: string; normalized: string; evidence: string }>;
  eventDate: { at: string; expression: string; evidence: string } | null;
  suggestedFollowupAt: string | null;
  uncertainties: string[];
}

export interface ValidationResult {
  proposed: ProposedCase;
  /** Fields removed because their evidence could not be found in the input. */
  stripped: string[];
  /** Human-readable notes about what validation changed or doubted. */
  issues: string[];
  /** Contradictions between the claimed status and the text. */
  contradictions: string[];
}

export interface ValidationContext {
  source: string;
  capturedAt: Date;
  timeZone: string;
  /** Current time; defaults to now. Suggested follow-ups are never earlier than this. */
  now?: Date;
}

/** True when the quote (or ≥90% of its words) appears in the source text. */
export function evidenceFound(evidence: string | null | undefined, source: string): boolean {
  if (!evidence) return false;
  const e = foldForCompare(evidence);
  if (e.length < 2) return false;
  const s = foldForCompare(source);
  if (s.includes(e)) return true;
  const evTokens = tokens(evidence);
  if (evTokens.length === 0) return false;
  const srcTokens = new Set(tokens(source));
  const hits = evTokens.filter((t) => srcTokens.has(t)).length;
  return hits / evTokens.length >= 0.9;
}

const NOT_YET = /\b(not (yet )?(received|credited|reflected|done|resolved|arrived)|yet to|haven'?t|hasn'?t|still (pending|waiting)|pending|awaiting|nahi (aaya|mila))\b/i;

const DEFAULT_FOLLOWUP_DAYS: Record<string, number> = {
  REFUND: 7,
  REIMBURSEMENT: 7,
  PAYMENT: 2,
  REPAIR: 3,
  DELIVERY: 3,
  DOCUMENT: 3,
  SERVICE_REQUEST: 3,
  PERSONAL_PROMISE: 3,
  OTHER: 3,
};

export function validateExtraction(raw: Extraction, ctx: ValidationContext): ValidationResult {
  const { source } = ctx;
  const stripped: string[] = [];
  const issues: string[] = [];
  const contradictions: string[] = [];
  const uncertainties = [...raw.uncertainties];

  // Lifecycle stage must be backed by text.
  let lifecycleStage = raw.lifecycleStage;
  let lifecycleEvidence = raw.lifecycleEvidence;
  if (lifecycleStage && !evidenceFound(lifecycleEvidence, source)) {
    stripped.push('lifecycleStage');
    issues.push(`Status "${lifecycleStage}" removed: supporting text not found`);
    lifecycleStage = null;
    lifecycleEvidence = null;
  }

  // Counterparty: evidence must exist and the name must actually appear in the input.
  let counterparty: ProposedCase['counterparty'] = null;
  if (raw.counterparty) {
    const nameTokens = tokens(raw.counterparty.name);
    const srcTokens = new Set(tokens(source));
    const nameInSource = nameTokens.some((t) => srcTokens.has(t)) || foldForCompare(source).includes(foldForCompare(raw.counterparty.name));
    if (evidenceFound(raw.counterparty.evidence, source) && nameInSource) {
      counterparty = { name: raw.counterparty.name.trim(), normalized: normalizeCounterparty(raw.counterparty.name), evidence: raw.counterparty.evidence };
    } else {
      stripped.push('counterparty');
      issues.push(`Counterparty "${raw.counterparty.name}" removed: not found in the text`);
    }
  }

  // Amount: digits must be inside verified evidence.
  let amount: ProposedCase['amount'] = null;
  if (raw.amount) {
    const digits = raw.amount.value.replace(/[^\d]/g, '');
    const evDigits = raw.amount.evidence.replace(/[^\d]/g, '');
    const parsed = parseMoney(raw.amount.value, raw.amount.evidence, raw.amount.currency);
    if (evidenceFound(raw.amount.evidence, source) && digits.length > 0 && evDigits.includes(digits) && parsed) {
      amount = { ...parsed, display: formatMoney(parsed.amountMinor, parsed.currency), evidence: raw.amount.evidence };
      if (!parsed.currency) uncertainties.push('Currency not stated');
    } else {
      stripped.push('amount');
      issues.push(`Amount "${raw.amount.value}" removed: not found in the text`);
    }
  }

  // Identifiers: value must appear inside verified evidence; must look like an ID.
  const identifiers: ProposedCase['identifiers'] = [];
  const seen = new Set<string>();
  for (const idf of raw.identifiers) {
    const normalized = normalizeIdentifier(idf.value);
    const ok =
      normalized.length >= 4 &&
      /\d/.test(normalized) &&
      evidenceFound(idf.evidence, source) &&
      normalizeIdentifier(idf.evidence).includes(normalized) &&
      normalizeIdentifier(source).includes(normalized);
    if (!ok) {
      stripped.push(`identifier:${idf.value}`);
      issues.push(`Reference "${idf.value}" removed: not found in the text`);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    identifiers.push({ kind: idf.kind, value: idf.value.trim(), normalized, evidence: idf.evidence });
  }

  // Event date ("refund initiated yesterday") is resolved in code against capture time.
  let eventDate: ProposedCase['eventDate'] = null;
  if (raw.eventDate) {
    const resolved = evidenceFound(raw.eventDate.evidence, source)
      ? resolveEventDate(raw.eventDate.expression, ctx.capturedAt, ctx.timeZone)
      : null;
    if (resolved) eventDate = { at: resolved.date.toISOString(), expression: raw.eventDate.expression, evidence: raw.eventDate.evidence };
    else issues.push(`Could not interpret when it happened ("${raw.eventDate.expression}")`);
  }

  // Deadline: the model gives the phrase; code computes the date and decides EXPLICIT vs ESTIMATED.
  let deadline: ProposedCase['deadline'] = null;
  if (raw.deadline) {
    const exprInEvidence = foldForCompare(raw.deadline.evidence).includes(foldForCompare(raw.deadline.expression));
    if (!evidenceFound(raw.deadline.evidence, source) || !exprInEvidence) {
      stripped.push('deadline');
      issues.push(`Deadline "${raw.deadline.expression}" removed: not found in the text`);
    } else {
      // "5-7 business days" counts from when it happened, if we know that.
      const reference = eventDate && isDurationExpression(raw.deadline.expression) ? new Date(eventDate.at) : ctx.capturedAt;
      const resolved = resolveDeadline(raw.deadline.expression, reference, ctx.timeZone);
      if (!resolved) {
        uncertainties.push(`Mentions timing "${raw.deadline.expression}" but no date could be worked out`);
      } else if (resolved.date.getTime() - ctx.capturedAt.getTime() > 2 * 365 * 24 * 3600 * 1000) {
        issues.push(`Deadline "${raw.deadline.expression}" ignored: more than 2 years away`);
      } else {
        deadline = {
          at: resolved.date.toISOString(),
          kind: resolved.kind,
          expression: raw.deadline.expression,
          evidence: raw.deadline.evidence,
        };
        if (resolved.date.getTime() < ctx.capturedAt.getTime() - 24 * 3600 * 1000) {
          uncertainties.push('The date mentioned appears to be in the past');
        }
      }
    }
  }

  // Status consistency checks.
  let classification = raw.classification;
  let isCommitment = raw.isCommitment && classification !== 'INFORMATIONAL';
  const completedStage = lifecycleStage ? COMPLETED_STAGES.has(lifecycleStage) : false;
  if ((classification === 'COMPLETED' || completedStage) && NOT_YET.test(source)) {
    contradictions.push('Marked as completed but the text says something is still pending');
  }
  if (classification === 'COMPLETED' || completedStage) isCommitment = false;
  if (raw.isCommitment && classification === 'UNCERTAIN') uncertainties.push('Not sure this needs tracking');
  if (!raw.isCommitment && ['PENDING_ACTION', 'WAITING_RESPONSE', 'WAITING_PAYMENT', 'APPOINTMENT'].includes(classification)) {
    contradictions.push('Classification and "is commitment" disagree');
    classification = 'UNCERTAIN';
  }

  // LifeLoop's own follow-up suggestion. Clearly separate from a deadline, and never in the past.
  const now = ctx.now ?? new Date();
  let suggestedFollowupAt: string | null = null;
  if (isCommitment) {
    if (deadline) {
      const at = new Date(deadline.at);
      const dayBefore = new Date(at.getTime() - 24 * 3600 * 1000);
      suggestedFollowupAt = (deadline.kind === 'EXPLICIT' && dayBefore > ctx.capturedAt ? dayBefore : at).toISOString();
    } else if (raw.category && raw.category !== 'APPOINTMENT') {
      suggestedFollowupAt = followUpAfter(DEFAULT_FOLLOWUP_DAYS[raw.category] ?? 3, ctx.capturedAt, ctx.timeZone).toISOString();
    }
    if (suggestedFollowupAt && new Date(suggestedFollowupAt) < now) {
      suggestedFollowupAt = followUpAfter(1, now, ctx.timeZone).toISOString();
    }
  }

  return {
    proposed: {
      isCommitment,
      classification,
      category: raw.category,
      lifecycleStage,
      lifecycleEvidence,
      title: raw.title.trim().slice(0, 120),
      summary: raw.summary,
      waitingOn: raw.waitingOn,
      counterparty,
      nextAction: raw.nextAction,
      deadline,
      amount,
      identifiers,
      eventDate,
      suggestedFollowupAt,
      uncertainties: [...new Set(uncertainties)],
    },
    stripped,
    issues,
    contradictions,
  };
}
