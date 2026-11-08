import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, like, lte, or, sql } from 'drizzle-orm';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB, type DbOrTx } from '../../database/database.module.js';
import {
  users,
  attachments,
  caseCaptures,
  caseEvents,
  caseIdentifiers,
  cases,
  captures,
  suggestions,
  type AttachmentRow,
  type CaptureRow,
  type CaseRow,
} from '../../database/schema.js';
import type { CaseFilterInput, CreateCaseInput, UpdateCaseInput } from '../../graphql/models.js';
import { COMPLETED_STAGES } from '../extraction/extraction.schema.js';
import { detectCurrency, parseAmount } from '../extraction/money.js';
import { normalizeCounterparty } from '../extraction/text.js';
import { startOfLocalDay } from '../extraction/dates.js';
import type { ProposedCase } from '../extraction/validate.js';
import type { CandidateCase } from '../matching/match.js';
import { needsReview } from '../suggestions/review-queue.js';
import { canTransition, commitmentTypeFor, isCaseStatus, isCategory, isWaitingOn, STAGE_LABELS } from './case-rules.js';

export interface NewCaseData {
  title: string;
  description: string | null;
  category: string;
  commitmentType: string;
  waitingOn: string;
  counterpartyName: string | null;
  statusLabel: string | null;
  lifecycleStage: string | null;
  nextAction: string | null;
  amountMinor: number | null;
  currency: string | null;
  deadlineAt: Date | null;
  deadlineKind: 'EXPLICIT' | 'ESTIMATED' | 'NONE';
  deadlineEvidence: string | null;
  followupAt: Date | null;
  identifiers: Array<{ kind: string; value: string; normalized: string }>;
}

interface Origin {
  actor: 'USER' | 'SYSTEM';
  captureId?: string | null;
  suggestionId?: string | null;
}

const ACTIVE_STATUSES = ['OPEN', 'SNOOZED'];

/** Builds case data from an AI proposal (already validated). */
export function caseDataFromProposal(p: ProposedCase): NewCaseData {
  return {
    title: p.title,
    description: p.summary,
    category: p.category ?? 'OTHER',
    commitmentType: commitmentTypeFor(p.classification),
    waitingOn: p.waitingOn,
    counterpartyName: p.counterparty?.name ?? null,
    statusLabel: p.lifecycleStage ? (STAGE_LABELS[p.lifecycleStage] ?? null) : null,
    lifecycleStage: p.lifecycleStage,
    nextAction: p.nextAction?.text ?? null,
    amountMinor: p.amount?.amountMinor ?? null,
    currency: p.amount?.currency ?? null,
    deadlineAt: p.deadline ? new Date(p.deadline.at) : null,
    deadlineKind: p.deadline?.kind ?? 'NONE',
    deadlineEvidence: p.deadline?.evidence ?? null,
    followupAt: p.suggestedFollowupAt ? new Date(p.suggestedFollowupAt) : null,
    identifiers: p.identifiers.map((i) => ({ kind: i.kind, value: i.value, normalized: i.normalized })),
  };
}

/**
 * Reminders can only be set for today or later (in the user's timezone).
 * A date earlier today is moved to 'now', so the reminder fires on the next scheduler run.
 */
export function assertReminderDate(date: Date, timeZone: string, now: Date = new Date()): Date {
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
  if (date.getTime() < startOfLocalDay(now, timeZone).getTime()) {
    throw new BadRequestException('Follow-up reminders must be today or later');
  }
  if (date.getTime() - now.getTime() > 5 * 365 * 24 * 3600 * 1000) throw new BadRequestException('That date is too far in the future');
  return date.getTime() < now.getTime() ? now : date;
}

export function parseAmountInput(amount: string | null | undefined, currency: string | null | undefined, fallbackCurrency: string | null) {
  if (amount === undefined || amount === null) return undefined;
  if (amount.trim() === '') return { amountMinor: null, currency: null };
  const minor = parseAmount(amount);
  if (minor === null) throw new BadRequestException(`"${amount}" is not a valid amount`);
  return { amountMinor: minor, currency: (currency?.toUpperCase() || detectCurrency(amount) || fallbackCurrency) ?? null };
}

@Injectable()
export class CasesService {
  constructor(@InjectDb() private readonly db: DB) {}

  // ------------------------------------------------------------------ queries

  async timezoneOf(userId: string): Promise<string> {
    const [u] = await this.db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId));
    return u?.tz ?? 'Asia/Kolkata';
  }

  async get(userId: string, id: string, tx: DbOrTx = this.db): Promise<CaseRow> {
    const [row] = await tx.select().from(cases).where(and(eq(cases.id, id), eq(cases.userId, userId))).limit(1);
    if (!row) throw new NotFoundException('Case not found');
    return row;
  }

  async findOwned(userId: string, ids: string[]): Promise<CaseRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(cases).where(and(eq(cases.userId, userId), inArray(cases.id, ids)));
  }

  async list(userId: string, filter: CaseFilterInput = {}): Promise<CaseRow[]> {
    const statuses = (filter.statuses?.length ? filter.statuses : ACTIVE_STATUSES).filter(isCaseStatus);
    const conds = [eq(cases.userId, userId), inArray(cases.status, statuses.length ? statuses : ACTIVE_STATUSES)];
    if (filter.waitingOn && isWaitingOn(filter.waitingOn)) conds.push(eq(cases.waitingOn, filter.waitingOn));
    if (filter.search?.trim()) {
      const q = `%${filter.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const byIdentifier = this.db
        .select({ caseId: caseIdentifiers.caseId })
        .from(caseIdentifiers)
        .where(and(eq(caseIdentifiers.userId, userId), like(caseIdentifiers.valueDisplay, q)));
      conds.push(or(like(cases.title, q), like(cases.counterpartyName, q), inArray(cases.id, byIdentifier))!);
    }
    return this.db
      .select()
      .from(cases)
      .where(and(...conds))
      .orderBy(sql`${cases.followupAt} IS NULL`, asc(cases.followupAt), desc(cases.updatedAt))
      .limit(200);
  }

  async events(userId: string, caseId: string) {
    return this.db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.userId, userId)))
      .orderBy(desc(caseEvents.createdAt), desc(caseEvents.id));
  }

  async identifiers(userId: string, caseId: string) {
    return this.db
      .select()
      .from(caseIdentifiers)
      .where(and(eq(caseIdentifiers.caseId, caseId), eq(caseIdentifiers.userId, userId)));
  }

  async captures(userId: string, caseId: string): Promise<Array<{ capture: CaptureRow; attachment: AttachmentRow | null }>> {
    return this.db
      .select({ capture: captures, attachment: attachments })
      .from(caseCaptures)
      .innerJoin(captures, eq(captures.id, caseCaptures.captureId))
      .leftJoin(attachments, eq(attachments.id, captures.attachmentId))
      .where(and(eq(caseCaptures.caseId, caseId), eq(captures.userId, userId)))
      .orderBy(desc(captures.createdAt));
  }

  /** Active cases plus cases resolved in the last 30 days, with identifiers, for matching. */
  async candidatesForMatching(userId: string, tx: DbOrTx = this.db): Promise<CandidateCase[]> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rows = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.userId, userId), or(inArray(cases.status, ACTIVE_STATUSES), gte(cases.resolvedAt, since))))
      .orderBy(desc(cases.updatedAt))
      .limit(300);
    if (rows.length === 0) return [];
    const ids = await tx
      .select()
      .from(caseIdentifiers)
      .where(and(eq(caseIdentifiers.userId, userId), inArray(caseIdentifiers.caseId, rows.map((r) => r.id))));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      status: r.status,
      counterpartyNormalized: r.counterpartyNormalized,
      amountMinor: r.amountMinor,
      updatedAt: r.updatedAt,
      identifiers: ids.filter((i) => i.caseId === r.id).map((i) => ({ kind: i.kind, valueNormalized: i.valueNormalized })),
    }));
  }

  async caseIdForCapture(userId: string, captureId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ caseId: caseCaptures.caseId })
      .from(caseCaptures)
      .innerJoin(cases, eq(cases.id, caseCaptures.caseId))
      .where(and(eq(caseCaptures.captureId, captureId), eq(cases.userId, userId)))
      .limit(1);
    return row?.caseId ?? null;
  }

  async dashboard(userId: string) {
    const now = new Date();
    const endOfTomorrow = new Date(now.getTime() + 36 * 3600 * 1000);
    const active = and(eq(cases.userId, userId), eq(cases.status, 'OPEN'));
    const [needsAction, waitingOnOthers, followUpDue, recentlyResolved, [pending], [open], [resolved]] = await Promise.all([
      this.db.select().from(cases).where(and(active, eq(cases.waitingOn, 'USER')))
        .orderBy(sql`${cases.deadlineAt} IS NULL`, asc(cases.deadlineAt), desc(cases.updatedAt)).limit(10),
      this.db.select().from(cases).where(and(active, inArray(cases.waitingOn, ['OTHER_PARTY', 'UNKNOWN'])))
        .orderBy(sql`${cases.followupAt} IS NULL`, asc(cases.followupAt), desc(cases.updatedAt)).limit(10),
      this.db
        .select()
        .from(cases)
        .where(
          and(
            eq(cases.userId, userId),
            or(
              and(eq(cases.status, 'OPEN'), or(lte(cases.followupAt, endOfTomorrow), lte(cases.deadlineAt, endOfTomorrow))),
              and(eq(cases.status, 'SNOOZED'), isNotNull(cases.snoozedUntil), lte(cases.snoozedUntil, now)),
            ),
          ),
        )
        .orderBy(asc(sql`LEAST(COALESCE(${cases.followupAt}, '9999-12-31'), COALESCE(${cases.deadlineAt}, '9999-12-31'))`))
        .limit(10),
      this.db.select().from(cases).where(and(eq(cases.userId, userId), eq(cases.status, 'RESOLVED')))
        .orderBy(desc(cases.resolvedAt)).limit(5),
      this.db.select({ n: count() }).from(suggestions)
        .where(needsReview(this.db, userId)),
      this.db.select({ n: count() }).from(cases).where(and(eq(cases.userId, userId), inArray(cases.status, ACTIVE_STATUSES))),
      this.db.select({ n: count() }).from(cases).where(and(eq(cases.userId, userId), eq(cases.status, 'RESOLVED'))),
    ]);
    return {
      needsAction,
      waitingOnOthers,
      followUpDue,
      recentlyResolved,
      pendingSuggestions: pending?.n ?? 0,
      openCases: open?.n ?? 0,
      resolvedCases: resolved?.n ?? 0,
    };
  }

  // ------------------------------------------------------------------ commands (accept a transaction)

  private async event(
    tx: DbOrTx,
    userId: string,
    caseId: string,
    type: string,
    origin: Origin,
    data: { from?: unknown; to?: unknown; note?: string | null } = {},
  ) {
    await tx.insert(caseEvents).values({
      id: uuidv7(),
      caseId,
      userId,
      type,
      actor: origin.actor,
      fromValue: data.from ?? null,
      toValue: data.to ?? null,
      note: data.note ?? null,
      captureId: origin.captureId ?? null,
      sourceSuggestionId: origin.suggestionId ?? null,
    });
  }

  private async addIdentifiers(tx: DbOrTx, userId: string, caseId: string, ids: NewCaseData['identifiers']) {
    for (const i of ids) {
      await tx
        .insert(caseIdentifiers)
        .values({ id: uuidv7(), caseId, userId, kind: i.kind, valueNormalized: i.normalized, valueDisplay: i.value })
        .onDuplicateKeyUpdate({ set: { valueDisplay: i.value } });
    }
  }

  private async linkCapture(tx: DbOrTx, caseId: string, captureId: string, suggestionId: string | null) {
    await tx.insert(caseCaptures).values({ caseId, captureId, suggestionId }).onDuplicateKeyUpdate({ set: { suggestionId } });
  }

  async create(tx: DbOrTx, userId: string, data: NewCaseData, origin: Origin): Promise<string> {
    if (!data.title.trim()) throw new BadRequestException('Title is required');
    const id = uuidv7();
    await tx.insert(cases).values({
      id,
      userId,
      title: data.title.trim().slice(0, 200),
      description: data.description,
      category: isCategory(data.category) ? data.category : 'OTHER',
      commitmentType: data.commitmentType,
      waitingOn: isWaitingOn(data.waitingOn) ? data.waitingOn : 'UNKNOWN',
      counterpartyName: data.counterpartyName,
      counterpartyNormalized: data.counterpartyName ? normalizeCounterparty(data.counterpartyName) : null,
      status: 'OPEN',
      statusLabel: data.statusLabel,
      lifecycleStage: data.lifecycleStage,
      nextAction: data.nextAction,
      amountMinor: data.amountMinor,
      currency: data.currency,
      deadlineAt: data.deadlineAt,
      deadlineKind: data.deadlineAt ? data.deadlineKind : 'NONE',
      deadlineEvidence: data.deadlineEvidence,
      followupAt: data.followupAt,
    });
    await this.addIdentifiers(tx, userId, id, data.identifiers);
    await this.event(tx, userId, id, 'CREATED', origin, { to: { title: data.title } });
    if (origin.captureId) await this.linkCapture(tx, id, origin.captureId, origin.suggestionId ?? null);
    return id;
  }

  /**
   * Applies a new capture to an existing case: links the evidence, adds identifiers, updates the
   * status label, fills in missing facts, and optionally resolves the case. Never overwrites a
   * value the user already has with an AI guess, except the status label.
   */
  async applyUpdate(
    tx: DbOrTx,
    userId: string,
    caseId: string,
    p: ProposedCase,
    origin: Origin & { captureId: string },
    resolve: boolean,
  ): Promise<void> {
    const current = await this.get(userId, caseId, tx);
    await this.linkCapture(tx, caseId, origin.captureId, origin.suggestionId ?? null);
    await this.addIdentifiers(tx, userId, caseId, p.identifiers.map((i) => ({ kind: i.kind, value: i.value, normalized: i.normalized })));

    const patch: Partial<CaseRow> = {};
    const label = p.lifecycleStage ? STAGE_LABELS[p.lifecycleStage] : undefined;
    if (label && label !== current.statusLabel) patch.statusLabel = label;
    if (p.lifecycleStage) patch.lifecycleStage = p.lifecycleStage;
    if (current.amountMinor == null && p.amount) {
      patch.amountMinor = p.amount.amountMinor;
      patch.currency = p.amount.currency;
    }
    if (!current.counterpartyName && p.counterparty) {
      patch.counterpartyName = p.counterparty.name;
      patch.counterpartyNormalized = p.counterparty.normalized;
    }
    if (p.deadline && (!current.deadlineAt || current.deadlineKind !== 'EXPLICIT')) {
      patch.deadlineAt = new Date(p.deadline.at);
      patch.deadlineKind = p.deadline.kind;
      patch.deadlineEvidence = p.deadline.evidence;
    }
    await this.event(tx, userId, caseId, 'CAPTURE_ATTACHED', origin, { to: { statusLabel: patch.statusLabel ?? null } });

    const shouldResolve = resolve && canTransition(current.status, 'RESOLVED');
    if (shouldResolve) {
      patch.status = 'RESOLVED';
      patch.resolvedAt = new Date();
      await this.event(tx, userId, caseId, 'STATUS_CHANGED', origin, { from: { status: current.status }, to: { status: 'RESOLVED' } });
    }
    if (Object.keys(patch).length) {
      await tx
        .update(cases)
        .set({ ...patch, version: sql`${cases.version} + 1` })
        .where(and(eq(cases.id, caseId), eq(cases.userId, userId)));
    }
  }

  /** Whether an update proposal should offer to resolve the case. */
  static proposalCompletes(p: ProposedCase): boolean {
    return p.classification === 'COMPLETED' || (p.lifecycleStage != null && COMPLETED_STAGES.has(p.lifecycleStage));
  }

  async createManual(userId: string, input: CreateCaseInput, defaultCurrency: string): Promise<CaseRow> {
    const money = parseAmountInput(input.amount, null, defaultCurrency);
    const followupAt = input.followupAt ? assertReminderDate(input.followupAt, await this.timezoneOf(userId)) : null;
    const id = await this.db.transaction((tx) =>
      this.create(
        tx,
        userId,
        {
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          commitmentType: input.waitingOn === 'USER' ? 'PENDING_ACTION' : 'WAITING_RESPONSE',
          waitingOn: input.waitingOn,
          counterpartyName: input.counterpartyName?.trim() || null,
          statusLabel: null,
          lifecycleStage: null,
          nextAction: input.nextAction ?? null,
          amountMinor: money?.amountMinor ?? null,
          currency: money?.currency ?? null,
          deadlineAt: input.deadlineAt ?? null,
          deadlineKind: input.deadlineAt ? 'EXPLICIT' : 'NONE',
          deadlineEvidence: input.deadlineAt ? 'Set by you' : null,
          followupAt,
          identifiers: [],
        },
        { actor: 'USER' },
      ),
    );
    return this.get(userId, id);
  }

  async update(userId: string, id: string, input: UpdateCaseInput, version: number): Promise<CaseRow> {
    if (input.followupAt && !input.clearFollowup) input.followupAt = assertReminderDate(input.followupAt, await this.timezoneOf(userId));
    await this.db.transaction(async (tx) => {
      const current = await this.get(userId, id, tx);
      if (current.version !== version) throw new ConflictException('This case was changed elsewhere. Reload and try again.');
      const patch: Partial<CaseRow> = {};
      const set = <K extends keyof CaseRow>(k: K, v: CaseRow[K] | undefined) => {
        if (v !== undefined && v !== current[k]) patch[k] = v;
      };
      if (input.title !== undefined && input.title !== null) {
        if (!input.title.trim()) throw new BadRequestException('Title is required');
        set('title', input.title.trim().slice(0, 200));
      }
      if (input.description !== undefined) set('description', input.description);
      if (input.category) {
        if (!isCategory(input.category)) throw new BadRequestException('Unknown category');
        set('category', input.category);
      }
      if (input.waitingOn) {
        if (!isWaitingOn(input.waitingOn)) throw new BadRequestException('Unknown waitingOn value');
        set('waitingOn', input.waitingOn);
      }
      if (input.counterpartyName !== undefined) {
        const name = input.counterpartyName?.trim() || null;
        set('counterpartyName', name);
        set('counterpartyNormalized', name ? normalizeCounterparty(name) : null);
      }
      if (input.statusLabel !== undefined) set('statusLabel', input.statusLabel);
      if (input.nextAction !== undefined) set('nextAction', input.nextAction);
      const money = parseAmountInput(input.amount, input.currency, current.currency);
      if (money) {
        set('amountMinor', money.amountMinor);
        set('currency', money.currency);
      }
      if (input.clearDeadline) {
        set('deadlineAt', null);
        set('deadlineKind', 'NONE');
        set('deadlineEvidence', null);
      } else if (input.deadlineAt) {
        set('deadlineAt', input.deadlineAt);
        set('deadlineKind', 'EXPLICIT');
        set('deadlineEvidence', 'Set by you');
      }
      if (input.clearFollowup) set('followupAt', null);
      else if (input.followupAt) set('followupAt', input.followupAt);
      if (Object.keys(patch).length === 0) return;

      const from: Record<string, unknown> = {};
      const to: Record<string, unknown> = {};
      for (const k of Object.keys(patch) as Array<keyof CaseRow>) {
        if (k === 'counterpartyNormalized' || k === 'deadlineEvidence' || k === 'deadlineKind' || k === 'amountMinor') continue;
        from[k] = current[k] instanceof Date ? (current[k] as Date).toISOString() : current[k];
        to[k] = patch[k] instanceof Date ? (patch[k] as Date).toISOString() : patch[k];
      }
      if ('amountMinor' in patch) {
        from.amount = current.amountMinor == null ? null : current.amountMinor / 100;
        to.amount = patch.amountMinor == null ? null : patch.amountMinor / 100;
      }
      const res = await tx
        .update(cases)
        .set({ ...patch, version: version + 1 })
        .where(and(eq(cases.id, id), eq(cases.userId, userId), eq(cases.version, version)));
      if ((res[0] as { affectedRows?: number }).affectedRows === 0) throw new ConflictException('This case was changed elsewhere.');
      await this.event(tx, userId, id, 'FIELD_UPDATED', { actor: 'USER' }, { from, to });
    });
    return this.get(userId, id);
  }

  async changeStatus(userId: string, id: string, status: string, note: string | null): Promise<CaseRow> {
    if (!isCaseStatus(status)) throw new BadRequestException('Unknown status');
    await this.db.transaction(async (tx) => {
      const current = await this.get(userId, id, tx);
      if (current.status === status) return;
      if (!canTransition(current.status, status)) {
        throw new BadRequestException(`Cannot change a ${current.status.toLowerCase()} case to ${status.toLowerCase()}`);
      }
      await tx
        .update(cases)
        .set({
          status,
          resolvedAt: status === 'RESOLVED' ? new Date() : status === 'OPEN' ? null : current.resolvedAt,
          snoozedUntil: status === 'SNOOZED' ? current.snoozedUntil : null,
          version: current.version + 1,
        })
        .where(and(eq(cases.id, id), eq(cases.userId, userId)));
      await this.event(tx, userId, id, 'STATUS_CHANGED', { actor: 'USER' }, {
        from: { status: current.status },
        to: { status },
        note,
      });
    });
    return this.get(userId, id);
  }

  async snooze(userId: string, id: string, until: Date): Promise<CaseRow> {
    if (until.getTime() <= Date.now()) throw new BadRequestException('Snooze date must be in the future');
    await this.db.transaction(async (tx) => {
      const current = await this.get(userId, id, tx);
      if (!canTransition(current.status, 'SNOOZED') && current.status !== 'SNOOZED') {
        throw new BadRequestException('Only open cases can be snoozed');
      }
      await tx
        .update(cases)
        .set({ status: 'SNOOZED', snoozedUntil: until, followupAt: until, version: current.version + 1 })
        .where(and(eq(cases.id, id), eq(cases.userId, userId)));
      await this.event(tx, userId, id, 'SNOOZED', { actor: 'USER' }, { to: { snoozedUntil: until.toISOString() } });
    });
    return this.get(userId, id);
  }

  async addNote(userId: string, caseId: string, note: string) {
    const text = note.trim();
    if (!text) throw new BadRequestException('Note is empty');
    if (text.length > 5000) throw new BadRequestException('Note is too long');
    await this.get(userId, caseId);
    await this.db.transaction(async (tx) => {
      await this.event(tx, userId, caseId, 'NOTE_ADDED', { actor: 'USER' }, { note: text });
      await tx.update(cases).set({ updatedAt: new Date() }).where(and(eq(cases.id, caseId), eq(cases.userId, userId)));
    });
    return this.get(userId, caseId);
  }

  async logFollowUp(userId: string, caseId: string, note: string | null, nextFollowupAt: Date | null): Promise<CaseRow> {
    if (nextFollowupAt) nextFollowupAt = assertReminderDate(nextFollowupAt, await this.timezoneOf(userId));
    await this.db.transaction(async (tx) => {
      const current = await this.get(userId, caseId, tx);
      await tx
        .update(cases)
        .set({ followupAt: nextFollowupAt, status: current.status === 'SNOOZED' ? 'OPEN' : current.status, snoozedUntil: null, version: current.version + 1 })
        .where(and(eq(cases.id, caseId), eq(cases.userId, userId)));
      await this.event(tx, userId, caseId, 'FOLLOWED_UP', { actor: 'USER' }, {
        to: { followupAt: nextFollowupAt?.toISOString() ?? null },
        note: note?.trim() || null,
      });
    });
    return this.get(userId, caseId);
  }
}
