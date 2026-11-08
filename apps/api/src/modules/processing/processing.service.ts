import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, isNull, ne } from 'drizzle-orm';
import { sha256 } from '../../common/hash.js';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { attachments, captures, extractionRuns, suggestions, users, type CaptureRow } from '../../database/schema.js';
import { RetryableAiError } from '../ai/anthropic.provider.js';
import { CasesService } from '../cases/cases.service.js';
import { JOB_EXTRACT, JOB_OCR } from '../captures/captures.service.js';
import { ExtractionService } from '../extraction/extraction.service.js';
import { JobHandlerRegistry, NonRetryableError } from '../jobs/job-handlers.js';
import { JobQueue } from '../jobs/job-queue.service.js';
import { matchCases } from '../matching/match.js';
import { OcrService } from '../ocr/ocr.service.js';
import { LocalDiskStorage } from '../storage/storage.service.js';
import { SuggestionsService, type SuggestionKind } from '../suggestions/suggestions.service.js';

const DUPLICATE_WINDOW_MS = 90 * 24 * 3600 * 1000;

/**
 * Pipeline job handlers:
 *   capture.ocr      screenshot -> text (Tesseract)
 *   capture.extract  text -> AI extraction -> validation -> matching -> suggestion
 */
@Injectable()
export class ProcessingService implements OnModuleInit {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @InjectDb() private readonly db: DB,
    private readonly registry: JobHandlerRegistry,
    private readonly jobs: JobQueue,
    private readonly storage: LocalDiskStorage,
    private readonly ocr: OcrService,
    private readonly extraction: ExtractionService,
    private readonly cases: CasesService,
    private readonly suggestions: SuggestionsService,
  ) {}

  onModuleInit() {
    this.registry.register(JOB_OCR, {
      handle: (p) => this.runOcr(String(p.captureId), String(p.userId)),
      onDead: (p, err) => this.fail(String(p.captureId), String(p.userId), err instanceof NonRetryableError ? err.code : 'OCR_FAILED'),
    });
    this.registry.register(JOB_EXTRACT, {
      handle: (p) => this.runExtract(String(p.captureId), String(p.userId)),
      onDead: (p, err) => this.fail(String(p.captureId), String(p.userId), err instanceof NonRetryableError ? err.code : 'EXTRACTION_FAILED'),
    });
  }

  private async loadCapture(captureId: string, userId: string): Promise<CaptureRow | null> {
    const [row] = await this.db.select().from(captures).where(and(eq(captures.id, captureId), eq(captures.userId, userId))).limit(1);
    return row ?? null;
  }

  private async fail(captureId: string, userId: string, code: string) {
    await this.db
      .update(captures)
      .set({ status: 'FAILED', failureCode: code })
      .where(and(eq(captures.id, captureId), eq(captures.userId, userId)));
  }

  async runOcr(captureId: string, userId: string) {
    const capture = await this.loadCapture(captureId, userId);
    if (!capture || capture.status !== 'PREPROCESSING') return; // already handled (idempotent)
    if (!capture.attachmentId) throw new NonRetryableError('Capture has no attachment', 'NO_ATTACHMENT');
    const [attachment] = await this.db.select().from(attachments).where(and(eq(attachments.id, capture.attachmentId), eq(attachments.userId, userId)));
    if (!attachment) throw new NonRetryableError('Attachment missing', 'NO_ATTACHMENT');

    const started = Date.now();
    const result = await this.ocr.recognize(await this.storage.get(attachment.storageKey));
    const runId = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.insert(extractionRuns).values({
        id: runId,
        captureId,
        userId,
        stage: 'OCR',
        provider: 'tesseract',
        model: 'tesseract.js',
        inputHash: attachment.sha256,
        validatedOutput: { textLength: result.text.length, lowQuality: result.lowQuality },
        latencyMs: Date.now() - started,
        status: result.text.length >= 3 ? 'SUCCEEDED' : 'INVALID',
      });
      if (result.text.length < 3) {
        await tx.update(captures).set({ status: 'FAILED', failureCode: 'NO_TEXT_FOUND', ocrConfidence: result.confidence }).where(eq(captures.id, captureId));
        return;
      }
      await tx
        .update(captures)
        .set({ normalizedText: result.text, ocrConfidence: result.confidence, status: 'EXTRACTING' })
        .where(eq(captures.id, captureId));
      await this.jobs.enqueue(JOB_EXTRACT, { captureId, userId }, { tx, dedupeKey: `extract:${captureId}:ocr-${runId}`, maxAttempts: 4, userId });
    });
  }

  async runExtract(captureId: string, userId: string) {
    const capture = await this.loadCapture(captureId, userId);
    if (!capture || capture.status !== 'EXTRACTING') return;
    const text = capture.editedText ?? capture.normalizedText;
    if (!text) throw new NonRetryableError('Nothing to extract', 'NO_TEXT_FOUND');
    const [user] = await this.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
    const timeZone = user?.timezone ?? 'Asia/Kolkata';

    // T0: exact duplicate of something already shared (skip the AI call entirely).
    if (!capture.editedText && capture.contentHash) {
      const [earlier] = await this.db
        .select({ id: captures.id })
        .from(captures)
        .where(
          and(
            eq(captures.userId, userId),
            eq(captures.contentHash, capture.contentHash),
            ne(captures.id, capture.id),
            isNull(captures.editedText),
            gte(captures.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS)),
          ),
        )
        .orderBy(desc(captures.createdAt))
        .limit(1);
      const [earlierSuggestion] = earlier
        ? await this.db
            .select()
            .from(suggestions)
            .where(and(eq(suggestions.captureId, earlier.id), eq(suggestions.userId, userId), ne(suggestions.status, 'SUPERSEDED')))
            .orderBy(desc(suggestions.createdAt))
            .limit(1)
        : [];
      if (earlier && earlierSuggestion) {
        const caseId = await this.cases.caseIdForCapture(userId, earlier.id);
        await this.db.transaction(async (tx) => {
          await this.suggestions.create(tx, {
            userId,
            captureId,
            extractionRunId: null,
            kind: 'DUPLICATE',
            proposed: earlierSuggestion.proposed as never,
            confidence: {
              score: earlierSuggestion.confidenceScore,
              band: earlierSuggestion.confidenceBand as 'HIGH' | 'MEDIUM' | 'LOW',
              factors: earlierSuggestion.confidenceFactors as never,
            },
            targetCaseId: caseId,
            duplicateOfCaptureId: earlier.id,
            candidates: [],
          });
          await tx.update(captures).set({ status: 'DUPLICATE' }).where(eq(captures.id, captureId));
        });
        return;
      }
    }

    let outcome;
    try {
      outcome = await this.extraction.extract({
        text,
        capturedAt: capture.createdAt,
        timeZone,
        sourceKind: capture.source as 'TEXT' | 'PASTE' | 'SCREENSHOT',
        ocrConfidence: capture.ocrConfidence,
      });
    } catch (err) {
      if (err instanceof RetryableAiError) throw err; // worker retries with backoff
      throw err instanceof Error ? err : new Error(String(err));
    }

    const runId = uuidv7();
    const base = {
      id: runId,
      captureId,
      userId,
      stage: 'EXTRACT',
      provider: outcome.response.provider,
      model: outcome.response.model,
      promptVersion: outcome.response.promptVersion,
      inputHash: sha256(text),
      rawOutput: (outcome.response.raw ?? null) as never,
      tokensIn: outcome.response.tokensIn ?? null,
      tokensOut: outcome.response.tokensOut ?? null,
      latencyMs: outcome.latencyMs,
    };

    if (!outcome.ok) {
      await this.db.insert(extractionRuns).values({ ...base, status: 'INVALID', validationIssues: outcome.schemaErrors });
      throw new NonRetryableError('AI output did not match the schema', 'AI_OUTPUT_INVALID');
    }

    const { validation, confidence } = outcome;
    const proposed = validation.proposed;
    const candidateCases = await this.cases.candidatesForMatching(userId);
    const match = matchCases(proposed, candidateCases);

    let kind: SuggestionKind;
    if (match.targetCaseId) kind = 'UPDATE_CASE';
    else if (proposed.isCommitment) kind = 'NEW_CASE';
    else kind = 'NOT_ACTIONABLE';

    await this.db.transaction(async (tx) => {
      await tx.insert(extractionRuns).values({
        ...base,
        status: 'SUCCEEDED',
        validatedOutput: proposed as never,
        validationIssues: [...validation.issues, ...validation.contradictions],
      });
      await this.suggestions.create(tx, {
        userId,
        captureId,
        extractionRunId: runId,
        kind,
        proposed,
        confidence,
        targetCaseId: match.targetCaseId,
        candidates: match.candidates,
      });
      await tx
        .update(captures)
        .set({ status: kind === 'NOT_ACTIONABLE' && match.candidates.length === 0 ? 'NO_COMMITMENT' : 'NEEDS_REVIEW', failureCode: null })
        .where(eq(captures.id, captureId));
    });
    this.logger.log(`capture ${captureId}: ${kind} (${confidence.band} ${confidence.score}), ${match.candidates.length} candidate(s)`);
  }
}
