import type { AttachmentRow, CaptureRow, CaseEventRow, CaseRow, SuggestionRow } from '../database/schema.js';
import type { ConfidenceFactor as Factor } from '../modules/extraction/confidence.js';
import type { ProposedCase } from '../modules/extraction/validate.js';
import { formatMoney } from '../modules/extraction/money.js';
import { STAGE_LABELS } from '../modules/cases/case-rules.js';
import type { Attachment, Capture, Case, CaseEvent, Proposal, Suggestion } from './models.js';

export function toCase(row: CaseRow): Case {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    commitmentType: row.commitmentType,
    waitingOn: row.waitingOn,
    counterpartyName: row.counterpartyName,
    status: row.status,
    statusLabel: row.statusLabel,
    nextAction: row.nextAction,
    amount: row.amountMinor == null ? null : row.amountMinor / 100,
    currency: row.currency,
    amountDisplay: row.amountMinor == null ? null : formatMoney(row.amountMinor, row.currency),
    deadlineAt: row.deadlineAt,
    deadlineKind: row.deadlineKind,
    deadlineEvidence: row.deadlineEvidence,
    followupAt: row.followupAt,
    snoozedUntil: row.snoozedUntil,
    resolvedAt: row.resolvedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    kind: row.kind,
    durationMs: row.durationMs,
    mimeType: row.storedMime,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    url: `/api/attachments/${row.id}/content`,
  };
}

export function toCapture(row: CaptureRow, attachment?: AttachmentRow | null): Capture {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    rawText: row.rawText,
    extractedText: row.normalizedText,
    editedText: row.editedText,
    ocrConfidence: row.ocrConfidence,
    note: row.note,
    language: row.language,
    failureCode: row.failureCode,
    attachment: attachment ? toAttachment(attachment) : null,
    createdAt: row.createdAt,
  };
}

export function toProposal(p: ProposedCase): Proposal {
  return {
    isCommitment: p.isCommitment,
    classification: p.classification,
    category: p.category,
    lifecycleStage: p.lifecycleStage,
    statusLabel: p.lifecycleStage ? (STAGE_LABELS[p.lifecycleStage] ?? null) : null,
    lifecycleEvidence: p.lifecycleEvidence,
    title: p.title,
    summary: p.summary,
    waitingOn: p.waitingOn,
    counterparty: p.counterparty ? { value: p.counterparty.name, evidence: p.counterparty.evidence } : null,
    nextAction: p.nextAction ? { value: p.nextAction.text, evidence: p.nextAction.evidence } : null,
    deadline: p.deadline ? { ...p.deadline, at: new Date(p.deadline.at) } : null,
    amount: p.amount
      ? { amount: p.amount.amountMinor / 100, currency: p.amount.currency, display: p.amount.display, evidence: p.amount.evidence }
      : null,
    identifiers: p.identifiers.map((i) => ({ kind: i.kind, value: i.value, evidence: i.evidence })),
    eventDate: p.eventDate ? { ...p.eventDate, at: new Date(p.eventDate.at) } : null,
    suggestedFollowupAt: p.suggestedFollowupAt ? new Date(p.suggestedFollowupAt) : null,
    uncertainties: p.uncertainties,
  };
}

export function toSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    captureId: row.captureId,
    kind: row.kind,
    status: row.status,
    proposed: toProposal(row.proposed as ProposedCase),
    confidenceScore: row.confidenceScore,
    confidenceBand: row.confidenceBand,
    confidenceFactors: row.confidenceFactors as Factor[],
    targetCaseId: row.targetCaseId,
    duplicateOfCaptureId: row.duplicateOfCaptureId,
    createdAt: row.createdAt,
  };
}

const fmt = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return String(v);
};

export function toCaseEvent(row: CaseEventRow): CaseEvent {
  const from = (row.fromValue ?? {}) as Record<string, unknown>;
  const to = (row.toValue ?? {}) as Record<string, unknown>;
  let summary: string | null = null;
  switch (row.type) {
    case 'CREATED':
      summary = 'Case created';
      break;
    case 'STATUS_CHANGED':
      summary = `Status: ${fmt(from.status)} → ${fmt(to.status)}`;
      break;
    case 'FIELD_UPDATED':
      summary = Object.keys(to)
        .map((k) => `${k}: ${fmt(from[k])} → ${fmt(to[k])}`)
        .join('; ');
      break;
    case 'CAPTURE_ATTACHED':
      summary = to.statusLabel ? `New update: ${fmt(to.statusLabel)}` : 'New information attached';
      break;
    case 'NOTE_ADDED':
      summary = 'Note added';
      break;
    case 'FOLLOWED_UP':
      summary = to.followupAt ? `Followed up; next follow-up ${fmt(to.followupAt)}` : 'Followed up';
      break;
    case 'SNOOZED':
      summary = `Snoozed until ${fmt(to.snoozedUntil)}`;
      break;
    default:
      summary = null;
  }
  return { id: row.id, type: row.type, actor: row.actor, note: row.note, summary, captureId: row.captureId, createdAt: row.createdAt };
}
