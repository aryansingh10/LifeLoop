import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { sha256 } from '../../common/hash.js';
import { uuidv7, UUID_RE } from '../../common/ids.js';
import { InjectDb, type DB, type DbOrTx } from '../../database/database.module.js';
import { attachments, captures, type AttachmentRow, type CaptureRow } from '../../database/schema.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { foldForCompare, MAX_INPUT_CHARS, normalizeInput } from '../extraction/text.js';
import { JobQueue } from '../jobs/job-queue.service.js';

export const JOB_OCR = 'capture.ocr';
export const JOB_EXTRACT = 'capture.extract';

@Injectable()
export class CapturesService {
  constructor(
    @InjectDb() private readonly db: DB,
    private readonly jobs: JobQueue,
    private readonly attachments: AttachmentsService,
  ) {}

  async get(userId: string, id: string, tx: DbOrTx = this.db): Promise<CaptureRow> {
    const [row] = await tx.select().from(captures).where(and(eq(captures.id, id), eq(captures.userId, userId))).limit(1);
    if (!row) throw new NotFoundException('Capture not found');
    return row;
  }

  async getWithAttachment(userId: string, id: string): Promise<{ capture: CaptureRow; attachment: AttachmentRow | null }> {
    const [row] = await this.db
      .select({ capture: captures, attachment: attachments })
      .from(captures)
      .leftJoin(attachments, eq(attachments.id, captures.attachmentId))
      .where(and(eq(captures.id, id), eq(captures.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException('Capture not found');
    return row;
  }

  async list(userId: string, limit = 30) {
    return this.db
      .select({ capture: captures, attachment: attachments })
      .from(captures)
      .leftJoin(attachments, eq(attachments.id, captures.attachmentId))
      .where(eq(captures.userId, userId))
      .orderBy(desc(captures.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  private async existing(userId: string, clientRequestId: string): Promise<CaptureRow | null> {
    const [row] = await this.db
      .select()
      .from(captures)
      .where(and(eq(captures.userId, userId), eq(captures.clientRequestId, clientRequestId)))
      .limit(1);
    return row ?? null;
  }

  async createText(userId: string, text: string, source: string, clientRequestId: string): Promise<CaptureRow> {
    if (!UUID_RE.test(clientRequestId)) throw new BadRequestException('clientRequestId must be a UUID');
    const prior = await this.existing(userId, clientRequestId);
    if (prior) return prior; // idempotent retry
    const normalized = normalizeInput(text ?? '');
    if (normalized.length < 3) throw new BadRequestException('Please enter a little more detail');
    if (normalized.length > MAX_INPUT_CHARS) {
      throw new BadRequestException(`That's too long (${normalized.length} characters). Please keep it under ${MAX_INPUT_CHARS}.`);
    }
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.insert(captures).values({
        id,
        userId,
        source: source === 'PASTE' ? 'PASTE' : 'TEXT',
        rawText: text,
        normalizedText: normalized,
        contentHash: sha256(foldForCompare(normalized)),
        clientRequestId,
        status: 'EXTRACTING',
      });
      await this.jobs.enqueue(JOB_EXTRACT, { captureId: id, userId }, { tx, dedupeKey: `extract:${id}:0`, maxAttempts: 4, userId });
    });
    return this.get(userId, id);
  }

  async createScreenshot(userId: string, attachmentId: string, clientRequestId: string, note?: string | null): Promise<CaptureRow> {
    if (!UUID_RE.test(clientRequestId)) throw new BadRequestException('clientRequestId must be a UUID');
    const prior = await this.existing(userId, clientRequestId);
    if (prior) return prior;
    const attachment = await this.attachments.get(userId, attachmentId); // ownership check
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.insert(captures).values({
        id,
        userId,
        source: 'SCREENSHOT',
        attachmentId: attachment.id,
        note: note?.trim().slice(0, 500) || null,
        contentHash: sha256(`img:${attachment.sha256}`),
        clientRequestId,
        status: 'PREPROCESSING',
      });
      await this.jobs.enqueue(JOB_OCR, { captureId: id, userId }, { tx, dedupeKey: `ocr:${id}:0`, maxAttempts: 3, userId });
    });
    return this.get(userId, id);
  }

  /** User corrected the text (e.g. bad OCR): keep the original, store the edit, re-run extraction. */
  async reprocess(userId: string, id: string, editedText: string): Promise<CaptureRow> {
    const capture = await this.get(userId, id);
    if (['PREPROCESSING', 'EXTRACTING'].includes(capture.status)) throw new ConflictException('This capture is still being processed');
    const normalized = normalizeInput(editedText ?? '');
    if (normalized.length < 3) throw new BadRequestException('Please enter a little more detail');
    if (normalized.length > MAX_INPUT_CHARS) throw new BadRequestException('That text is too long');
    await this.db.transaction(async (tx) => {
      await tx
        .update(captures)
        .set({ editedText: normalized, status: 'EXTRACTING', failureCode: null })
        .where(and(eq(captures.id, id), eq(captures.userId, userId)));
      await this.jobs.enqueue(JOB_EXTRACT, { captureId: id, userId }, { tx, dedupeKey: `extract:${id}:${uuidv7()}`, maxAttempts: 4, userId });
    });
    return this.get(userId, id);
  }

  async retry(userId: string, id: string): Promise<CaptureRow> {
    const capture = await this.get(userId, id);
    if (capture.status !== 'FAILED') throw new ConflictException('Only failed captures can be retried');
    const needsOcr = capture.source === 'SCREENSHOT' && !capture.normalizedText;
    await this.db.transaction(async (tx) => {
      await tx
        .update(captures)
        .set({ status: needsOcr ? 'PREPROCESSING' : 'EXTRACTING', failureCode: null })
        .where(and(eq(captures.id, id), eq(captures.userId, userId)));
      await this.jobs.enqueue(needsOcr ? JOB_OCR : JOB_EXTRACT, { captureId: id, userId }, {
        tx,
        dedupeKey: `${needsOcr ? 'ocr' : 'extract'}:${id}:${uuidv7()}`,
        maxAttempts: 4,
        userId,
      });
    });
    return this.get(userId, id);
  }
}
