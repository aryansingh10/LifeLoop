import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { sha256 } from '../../common/hash.js';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB, type DbOrTx } from '../../database/database.module.js';
import { attachments, type AttachmentRow } from '../../database/schema.js';
import { LocalDiskStorage } from '../storage/storage.service.js';
import { parseWav, voiceNoteProblem } from './audio-validation.js';
import { MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES, sniffImageType } from './image-validation.js';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectDb() private readonly db: DB,
    private readonly storage: LocalDiskStorage,
  ) {}

  /**
   * Validates and stores an uploaded screenshot. Uploaded files are untrusted:
   * the type is sniffed from magic bytes, dimensions are capped, and the image is re-encoded
   * (which strips EXIF/GPS metadata and neutralizes polyglot files).
   */
  async createFromUpload(userId: string, file: { buffer: Buffer; size: number }): Promise<AttachmentRow> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('Files must be 5 MB or smaller');
    if (file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WAVE') {
      return this.createVoiceNote(userId, file.buffer);
    }
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException('Only screenshots (PNG, JPEG, WebP) and voice notes are supported');

    let output: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const image = sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate();
      const result = await image.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      output = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch {
      throw new BadRequestException('This image could not be read. Try another screenshot.');
    }

    const id = uuidv7();
    const storageKey = `users/${userId}/attachments/${id}.webp`;
    await this.storage.put(storageKey, output, 'image/webp');
    const row: typeof attachments.$inferInsert = {
      id,
      userId,
      kind: 'IMAGE',
      storageKey,
      originalMime: type,
      storedMime: 'image/webp',
      sizeBytes: output.length,
      sha256: sha256(file.buffer),
      width: width ?? null,
      height: height ?? null,
    };
    await this.db.insert(attachments).values(row);
    return this.get(userId, id);
  }

  /** Voice notes: strict WAV checks (format, length). Stored as-is; WAV has no metadata to strip. */
  private async createVoiceNote(userId: string, buffer: Buffer): Promise<AttachmentRow> {
    const info = parseWav(buffer);
    const problem = voiceNoteProblem(info);
    if (problem || !info) throw new BadRequestException(problem ?? 'This audio file could not be read.');
    const id = uuidv7();
    const storageKey = `users/${userId}/attachments/${id}.wav`;
    await this.storage.put(storageKey, buffer, 'audio/wav');
    await this.db.insert(attachments).values({
      id,
      userId,
      kind: 'AUDIO',
      storageKey,
      originalMime: 'audio/wav',
      storedMime: 'audio/wav',
      sizeBytes: buffer.length,
      sha256: sha256(buffer),
      durationMs: info.durationMs,
    });
    return this.get(userId, id);
  }

  async get(userId: string, id: string, tx: DbOrTx = this.db): Promise<AttachmentRow> {
    const [row] = await tx.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.userId, userId))).limit(1);
    if (!row) throw new NotFoundException('Attachment not found');
    return row;
  }

  async content(userId: string, id: string): Promise<{ row: AttachmentRow; data: Buffer }> {
    const row = await this.get(userId, id);
    return { row, data: await this.storage.get(row.storageKey) };
  }
}
