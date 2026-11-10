import { Args, GraphQLISODateTime, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';
import { CurrentUserId } from '../common/auth.js';
import { InjectDb, type DB } from '../database/database.module.js';
import { users } from '../database/schema.js';
import { CapturesService } from '../modules/captures/captures.service.js';
import { CasesService } from '../modules/cases/cases.service.js';
import { SuggestionsService } from '../modules/suggestions/suggestions.service.js';
import { toCapture, toCase, toCaseEvent, toSuggestion } from './mappers.js';
import {
  Capture,
  Case,
  CaseEvent,
  CaseFilterInput,
  CaseIdentifier,
  CreateCaseInput,
  CreateScreenshotCaptureInput,
  CreateTextCaptureInput,
  Dashboard,
  MatchCandidate,
  ReviewResult,
  Suggestion,
  SuggestionEditsInput,
  UpdateCaseInput,
} from './models.js';

@Resolver(() => Capture)
export class CapturesResolver {
  constructor(
    private readonly captureSvc: CapturesService,
    private readonly suggestionSvc: SuggestionsService,
  ) {}

  @Query(() => [Capture])
  async captures(@CurrentUserId() userId: string, @Args('limit', { type: () => Int, defaultValue: 30 }) limit: number) {
    return (await this.captureSvc.list(userId, limit)).map((r) => toCapture(r.capture, r.attachment));
  }

  @Query(() => Capture)
  async capture(@CurrentUserId() userId: string, @Args('id', { type: () => ID }) id: string) {
    const r = await this.captureSvc.getWithAttachment(userId, id);
    return toCapture(r.capture, r.attachment);
  }

  @Mutation(() => Capture)
  async createTextCapture(@CurrentUserId() userId: string, @Args('input') input: CreateTextCaptureInput) {
    return toCapture(await this.captureSvc.createText(userId, input.text, input.source, input.clientRequestId));
  }

  @Mutation(() => Capture, { description: 'Track an uploaded attachment' })
  createAttachmentCapture(@CurrentUserId() userId: string, @Args('input') input: CreateScreenshotCaptureInput) {
    return this.createScreenshotCapture(userId, input);
  }

  @Mutation(() => Capture, { description: 'Deprecated name; same as createAttachmentCapture' })
  async createScreenshotCapture(@CurrentUserId() userId: string, @Args('input') input: CreateScreenshotCaptureInput) {
    const created = await this.captureSvc.createFromAttachment(userId, input.attachmentId, input.clientRequestId, input.note, input.language);
    const r = await this.captureSvc.getWithAttachment(userId, created.id);
    return toCapture(r.capture, r.attachment);
  }

  @Mutation(() => Capture, { description: 'Re-run extraction on corrected text (original is kept)' })
  async reprocessCapture(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('editedText') editedText: string,
  ) {
    await this.captureSvc.reprocess(userId, id, editedText);
    const r = await this.captureSvc.getWithAttachment(userId, id);
    return toCapture(r.capture, r.attachment);
  }

  @Mutation(() => Capture)
  async retryCapture(@CurrentUserId() userId: string, @Args('id', { type: () => ID }) id: string) {
    await this.captureSvc.retry(userId, id);
    const r = await this.captureSvc.getWithAttachment(userId, id);
    return toCapture(r.capture, r.attachment);
  }

  @ResolveField(() => Suggestion, { nullable: true })
  async suggestion(@CurrentUserId() userId: string, @Parent() capture: Capture) {
    const s = await this.suggestionSvc.currentForCapture(userId, capture.id);
    return s ? toSuggestion(s) : null;
  }
}

@Resolver(() => Suggestion)
export class SuggestionsResolver {
  constructor(
    private readonly suggestionSvc: SuggestionsService,
    private readonly caseSvc: CasesService,
    private readonly captureSvc: CapturesService,
  ) {}

  @Query(() => [Suggestion], { description: 'Suggestions awaiting review' })
  async suggestions(@CurrentUserId() userId: string) {
    return (await this.suggestionSvc.listPending(userId)).map(toSuggestion);
  }

  @Query(() => Suggestion)
  async suggestion(@CurrentUserId() userId: string, @Args('id', { type: () => ID }) id: string) {
    return toSuggestion(await this.suggestionSvc.get(userId, id));
  }

  private async result(userId: string, r: { suggestionId: string; caseId: string | null }): Promise<ReviewResult> {
    const s = await this.suggestionSvc.get(userId, r.suggestionId);
    return { suggestion: toSuggestion(s), case: r.caseId ? toCase(await this.caseSvc.get(userId, r.caseId)) : null };
  }

  @Mutation(() => ReviewResult, { description: 'Approve (optionally with edits). Creates a case, or updates the target case.' })
  async approveSuggestion(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('edits', { type: () => SuggestionEditsInput, nullable: true }) edits?: SuggestionEditsInput,
    @Args('resolveCase', { type: () => Boolean, nullable: true }) resolveCase?: boolean,
    @Args('forceNew', { type: () => Boolean, nullable: true, description: 'Create a new case even if a matching case was found' }) forceNew?: boolean,
  ) {
    return this.result(userId, await this.suggestionSvc.approve(userId, id, edits, resolveCase, forceNew));
  }

  @Mutation(() => ReviewResult)
  async attachSuggestionToCase(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('resolveCase', { type: () => Boolean, nullable: true }) resolveCase?: boolean,
  ) {
    return this.result(userId, await this.suggestionSvc.attachToCase(userId, id, caseId, resolveCase));
  }

  @Mutation(() => ReviewResult)
  async rejectSuggestion(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { type: () => String, nullable: true }) reason?: string,
  ) {
    return this.result(userId, await this.suggestionSvc.reject(userId, id, reason));
  }

  @ResolveField(() => [MatchCandidate])
  async candidates(@CurrentUserId() userId: string, @Parent() s: Suggestion): Promise<MatchCandidate[]> {
    return (await this.suggestionSvc.candidates(userId, s.id)).map((c) => ({
      case: toCase(c.case),
      score: c.row.score,
      strength: c.row.strength,
      reasons: c.row.reasons,
    }));
  }

  @ResolveField(() => Case, { nullable: true })
  async targetCase(@CurrentUserId() userId: string, @Parent() s: Suggestion) {
    if (!s.targetCaseId) return null;
    const [c] = await this.caseSvc.findOwned(userId, [s.targetCaseId]);
    return c ? toCase(c) : null;
  }

  @ResolveField(() => Capture)
  async capture(@CurrentUserId() userId: string, @Parent() s: Suggestion) {
    const r = await this.captureSvc.getWithAttachment(userId, s.captureId);
    return toCapture(r.capture, r.attachment);
  }
}

@Resolver(() => Case)
export class CasesResolver {
  constructor(
    private readonly caseSvc: CasesService,
    @InjectDb() private readonly db: DB,
  ) {}

  @Query(() => Dashboard)
  async dashboard(@CurrentUserId() userId: string): Promise<Dashboard> {
    const d = await this.caseSvc.dashboard(userId);
    return {
      needsAction: d.needsAction.map(toCase),
      waitingOnOthers: d.waitingOnOthers.map(toCase),
      followUpDue: d.followUpDue.map(toCase),
      recentlyResolved: d.recentlyResolved.map(toCase),
      pendingSuggestions: d.pendingSuggestions,
      openCases: d.openCases,
      resolvedCases: d.resolvedCases,
    };
  }

  @Query(() => [Case])
  async cases(@CurrentUserId() userId: string, @Args('filter', { type: () => CaseFilterInput, nullable: true }) filter?: CaseFilterInput) {
    return (await this.caseSvc.list(userId, filter ?? {})).map(toCase);
  }

  @Query(() => Case)
  async case(@CurrentUserId() userId: string, @Args('id', { type: () => ID }) id: string) {
    return toCase(await this.caseSvc.get(userId, id));
  }

  @Mutation(() => Case, { description: 'Track something manually (no AI)' })
  async createCase(@CurrentUserId() userId: string, @Args('input') input: CreateCaseInput) {
    const [u] = await this.db.select({ currency: users.defaultCurrency }).from(users).where(eq(users.id, userId));
    return toCase(await this.caseSvc.createManual(userId, input, u?.currency ?? 'INR'));
  }

  @Mutation(() => Case)
  async updateCase(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCaseInput,
    @Args('version', { type: () => Int }) version: number,
  ) {
    return toCase(await this.caseSvc.update(userId, id, input, version));
  }

  @Mutation(() => Case)
  async changeCaseStatus(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('status') status: string,
    @Args('note', { type: () => String, nullable: true }) note?: string,
  ) {
    return toCase(await this.caseSvc.changeStatus(userId, id, status, note ?? null));
  }

  @Mutation(() => Case)
  async snoozeCase(
    @CurrentUserId() userId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('until', { type: () => GraphQLISODateTime }) until: Date,
  ) {
    return toCase(await this.caseSvc.snooze(userId, id, until));
  }

  @Mutation(() => Case)
  async addCaseNote(@CurrentUserId() userId: string, @Args('caseId', { type: () => ID }) caseId: string, @Args('note') note: string) {
    return toCase(await this.caseSvc.addNote(userId, caseId, note));
  }

  @Mutation(() => Case)
  async logFollowUp(
    @CurrentUserId() userId: string,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('note', { type: () => String, nullable: true }) note?: string,
    @Args('nextFollowupAt', { type: () => GraphQLISODateTime, nullable: true }) nextFollowupAt?: Date,
  ) {
    return toCase(await this.caseSvc.logFollowUp(userId, caseId, note ?? null, nextFollowupAt ?? null));
  }

  @ResolveField(() => [CaseIdentifier])
  async identifiers(@CurrentUserId() userId: string, @Parent() c: Case): Promise<CaseIdentifier[]> {
    return (await this.caseSvc.identifiers(userId, c.id)).map((i) => ({ kind: i.kind, value: i.valueDisplay }));
  }

  @ResolveField(() => [CaseEvent])
  async events(@CurrentUserId() userId: string, @Parent() c: Case) {
    return (await this.caseSvc.events(userId, c.id)).map(toCaseEvent);
  }

  @ResolveField(() => [Capture])
  async captures(@CurrentUserId() userId: string, @Parent() c: Case) {
    return (await this.caseSvc.captures(userId, c.id)).map((r) => toCapture(r.capture, r.attachment));
  }
}
