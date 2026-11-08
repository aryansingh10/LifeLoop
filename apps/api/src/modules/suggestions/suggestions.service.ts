import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB, type DbOrTx } from '../../database/database.module.js';
import {
  captures,
  suggestionMatchCandidates,
  suggestionReviews,
  suggestions,
  users,
  type SuggestionRow,
} from '../../database/schema.js';
import type { SuggestionEditsInput } from '../../graphql/models.js';
import { isCategory, isWaitingOn } from '../cases/case-rules.js';
import { CasesService, assertReminderDate, caseDataFromProposal, parseAmountInput, type NewCaseData } from '../cases/cases.service.js';
import type { Confidence } from '../extraction/confidence.js';
import { SCORING_VERSION } from '../extraction/confidence.js';
import type { ProposedCase } from '../extraction/validate.js';
import type { MatchCandidate } from '../matching/match.js';
import { needsReview } from './review-queue.js';

export type SuggestionKind = 'NEW_CASE' | 'UPDATE_CASE' | 'DUPLICATE' | 'NOT_ACTIONABLE';

export interface NewSuggestion {
  userId: string;
  captureId: string;
  extractionRunId: string | null;
  kind: SuggestionKind;
  proposed: ProposedCase;
  confidence: Confidence;
  targetCaseId: string | null;
  duplicateOfCaptureId?: string | null;
  candidates: MatchCandidate[];
}

const REJECT_REASONS = new Set(['NOT_A_COMMITMENT', 'WRONG_DETAILS', 'DUPLICATE', 'ALREADY_DONE', 'OTHER']);

@Injectable()
export class SuggestionsService {
  constructor(
    @InjectDb() private readonly db: DB,
    private readonly cases: CasesService,
  ) {}

  // ------------------------------------------------------------------ queries

  async get(userId: string, id: string, tx: DbOrTx = this.db): Promise<SuggestionRow> {
    const [row] = await tx.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.userId, userId))).limit(1);
    if (!row) throw new NotFoundException('Suggestion not found');
    return row;
  }

  async listPending(userId: string): Promise<SuggestionRow[]> {
    return this.db
      .select()
      .from(suggestions)
      .where(needsReview(this.db, userId))
      .orderBy(desc(suggestions.createdAt))
      .limit(100);
  }

  /** Current (non-superseded) suggestion for a capture. */
  async currentForCapture(userId: string, captureId: string): Promise<SuggestionRow | null> {
    const [row] = await this.db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.userId, userId), eq(suggestions.captureId, captureId), ne(suggestions.status, 'SUPERSEDED')))
      .orderBy(desc(suggestions.createdAt))
      .limit(1);
    return row ?? null;
  }

  async candidates(userId: string, suggestionId: string) {
    const rows = await this.db
      .select()
      .from(suggestionMatchCandidates)
      .where(eq(suggestionMatchCandidates.suggestionId, suggestionId))
      .orderBy(asc(suggestionMatchCandidates.rank));
    const owned = await this.cases.findOwned(userId, rows.map((r) => r.caseId));
    const byId = new Map(owned.map((c) => [c.id, c]));
    return rows.filter((r) => byId.has(r.caseId)).map((r) => ({ row: r, case: byId.get(r.caseId)! }));
  }

  // ------------------------------------------------------------------ pipeline writes

  async create(tx: DbOrTx, s: NewSuggestion): Promise<string> {
    // Reprocessing a capture supersedes its earlier pending suggestion.
    await tx
      .update(suggestions)
      .set({ status: 'SUPERSEDED', resolvedAt: new Date() })
      .where(and(eq(suggestions.captureId, s.captureId), eq(suggestions.userId, s.userId), eq(suggestions.status, 'PENDING')));
    const id = uuidv7();
    await tx.insert(suggestions).values({
      id,
      userId: s.userId,
      captureId: s.captureId,
      extractionRunId: s.extractionRunId,
      kind: s.kind,
      proposed: s.proposed,
      targetCaseId: s.targetCaseId,
      duplicateOfCaptureId: s.duplicateOfCaptureId ?? null,
      confidenceScore: s.confidence.score,
      confidenceBand: s.confidence.band,
      confidenceFactors: s.confidence.factors,
      scoringVersion: SCORING_VERSION,
      status: 'PENDING',
    });
    let rank = 0;
    for (const c of s.candidates) {
      await tx.insert(suggestionMatchCandidates).values({
        id: uuidv7(),
        suggestionId: id,
        caseId: c.caseId,
        score: c.score,
        strength: c.strength,
        reasons: c.reasons,
        rank: rank++,
      });
    }
    return id;
  }

  // ------------------------------------------------------------------ review actions (one transaction each)

  /** Locks the suggestion row and checks it is still awaiting review (idempotency under double-clicks). */
  private async lockPending(tx: DbOrTx, userId: string, id: string): Promise<SuggestionRow> {
    const [row] = await tx
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, id), eq(suggestions.userId, userId)))
      .for('update');
    if (!row) throw new NotFoundException('Suggestion not found');
    if (row.status !== 'PENDING') throw new ConflictException(`This suggestion was already ${row.status.toLowerCase()}`);
    return row;
  }

  private async markCaptureReviewed(tx: DbOrTx, userId: string, captureId: string) {
    await tx.update(captures).set({ updatedAt: new Date() }).where(and(eq(captures.id, captureId), eq(captures.userId, userId)));
  }

  /**
   * Approve: NEW_CASE (or "track anyway" on NOT_ACTIONABLE/DUPLICATE) creates a case;
   * UPDATE_CASE applies the update to its target case. Edits are recorded as a field diff.
   */
  async approve(
    userId: string,
    id: string,
    edits: SuggestionEditsInput | null | undefined,
    resolveTarget?: boolean | null,
    forceNew?: boolean | null,
  ) {
    return this.db.transaction(async (tx) => {
      const s = await this.lockPending(tx, userId, id);
      const proposed = s.proposed as ProposedCase;
      const [user] = await tx.select({ currency: users.defaultCurrency, timezone: users.timezone }).from(users).where(eq(users.id, userId));

      if (s.kind === 'UPDATE_CASE' && s.targetCaseId && !forceNew) {
        const resolve = resolveTarget ?? CasesService.proposalCompletes(proposed);
        await this.cases.applyUpdate(tx, userId, s.targetCaseId, proposed, { actor: 'USER', captureId: s.captureId, suggestionId: s.id }, resolve);
        await this.finish(tx, s, 'APPROVE', 'APPROVED', s.targetCaseId, null);
        return { suggestionId: s.id, caseId: s.targetCaseId };
      }

      const base = caseDataFromProposal(proposed);
      const { data, diff } = applyEdits(base, edits, user?.currency ?? 'INR');
      const now = new Date();
      if (edits?.followupAt && !edits.clearFollowup) {
        data.followupAt = assertReminderDate(edits.followupAt, user?.timezone ?? 'Asia/Kolkata', now);
      } else if (data.followupAt && data.followupAt < now) {
        // The suggested date passed while the suggestion waited for review: remind tomorrow instead.
        data.followupAt = new Date(now.getTime() + 24 * 3600 * 1000);
      }
      if (s.kind === 'NOT_ACTIONABLE' || s.kind === 'DUPLICATE') {
        // User chose to track it anyway; nothing to infer a follow-up from, so suggest one in 3 days.
        data.followupAt ??= new Date(Date.now() + 3 * 24 * 3600 * 1000);
        if (data.commitmentType === 'WAITING_RESPONSE' && data.waitingOn === 'UNKNOWN') data.waitingOn = 'OTHER_PARTY';
      }
      const caseId = await this.cases.create(tx, userId, data, { actor: 'USER', captureId: s.captureId, suggestionId: s.id });
      await this.finish(tx, s, diff ? 'EDIT_APPROVE' : 'APPROVE', 'APPROVED', caseId, diff);
      return { suggestionId: s.id, caseId };
    });
  }

  /** Attach the capture to a case the user picked (e.g. one of several ambiguous candidates). */
  async attachToCase(userId: string, id: string, caseId: string, resolve: boolean | null | undefined) {
    return this.db.transaction(async (tx) => {
      const s = await this.lockPending(tx, userId, id);
      await this.cases.get(userId, caseId, tx); // ownership check
      const proposed = s.proposed as ProposedCase;
      await this.cases.applyUpdate(
        tx,
        userId,
        caseId,
        proposed,
        { actor: 'USER', captureId: s.captureId, suggestionId: s.id },
        resolve ?? CasesService.proposalCompletes(proposed),
      );
      await this.finish(tx, s, 'ATTACH', 'ATTACHED', caseId, null);
      return { suggestionId: s.id, caseId };
    });
  }

  async reject(userId: string, id: string, reason: string | null | undefined) {
    const r = reason && REJECT_REASONS.has(reason) ? reason : 'OTHER';
    return this.db.transaction(async (tx) => {
      const s = await this.lockPending(tx, userId, id);
      await this.finish(tx, s, 'REJECT', 'REJECTED', null, null, r);
      return { suggestionId: s.id, caseId: null };
    });
  }

  private async finish(
    tx: DbOrTx,
    s: SuggestionRow,
    action: string,
    status: string,
    caseId: string | null,
    diff: Record<string, unknown> | null,
    rejectReason: string | null = null,
  ) {
    await tx.update(suggestions).set({ status, resolvedAt: new Date() }).where(eq(suggestions.id, s.id));
    await tx.insert(suggestionReviews).values({
      id: uuidv7(),
      suggestionId: s.id,
      userId: s.userId,
      action,
      fieldDiff: diff,
      rejectReason,
      resultingCaseId: caseId,
    });
    await this.markCaptureReviewed(tx, s.userId, s.captureId);
  }
}

/** Applies user edits on top of the AI proposal and records what changed (feedback for quality). */
export function applyEdits(
  base: NewCaseData,
  edits: SuggestionEditsInput | null | undefined,
  defaultCurrency: string,
): { data: NewCaseData; diff: Record<string, { from: unknown; to: unknown }> | null } {
  if (!edits) return { data: base, diff: null };
  const data: NewCaseData = { ...base };
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const change = <K extends keyof NewCaseData>(key: K, value: NewCaseData[K]) => {
    const before = data[key];
    const same = before instanceof Date && value instanceof Date ? before.getTime() === value.getTime() : before === value;
    if (!same) {
      diff[key] = { from: before instanceof Date ? before.toISOString() : before, to: value instanceof Date ? value.toISOString() : value };
      data[key] = value;
    }
  };
  if (edits.title != null) {
    if (!edits.title.trim()) throw new BadRequestException('Title is required');
    change('title', edits.title.trim());
  }
  if (edits.description !== undefined) change('description', edits.description ?? null);
  if (edits.category != null) {
    if (!isCategory(edits.category)) throw new BadRequestException('Unknown category');
    change('category', edits.category);
  }
  if (edits.waitingOn != null) {
    if (!isWaitingOn(edits.waitingOn)) throw new BadRequestException('Unknown waitingOn value');
    change('waitingOn', edits.waitingOn);
    if (edits.waitingOn === 'USER') change('commitmentType', 'PENDING_ACTION');
  }
  if (edits.counterpartyName !== undefined) change('counterpartyName', edits.counterpartyName?.trim() || null);
  if (edits.nextAction !== undefined) change('nextAction', edits.nextAction?.trim() || null);
  const money = parseAmountInput(edits.amount, edits.currency, base.currency ?? defaultCurrency);
  if (money) {
    change('amountMinor', money.amountMinor);
    change('currency', money.currency);
  }
  if (edits.clearDeadline) {
    change('deadlineAt', null);
    change('deadlineKind', 'NONE');
    change('deadlineEvidence', null);
  } else if (edits.deadlineAt) {
    change('deadlineAt', edits.deadlineAt);
    change('deadlineKind', 'EXPLICIT');
    change('deadlineEvidence', 'Set by you');
  }
  if (edits.clearFollowup) change('followupAt', null);
  else if (edits.followupAt) change('followupAt', edits.followupAt);
  return { data, diff: Object.keys(diff).length ? diff : null };
}
