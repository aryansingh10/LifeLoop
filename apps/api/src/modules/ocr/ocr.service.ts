import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { env } from '../../config/env.js';
import { normalizeInput } from '../extraction/text.js';

export interface OcrResult {
  text: string;
  /** Mean word confidence 0..100 as reported by Tesseract. */
  confidence: number;
  lowQuality: boolean;
}

/** Lines that are phone/app chrome rather than content (clock, battery, nav buttons). */
const UI_NOISE = /^(\d{1,2}[:.]\d{2}(\s?[ap]m)?|\d{1,3}%|lte|4g|5g|vo\s?lte|reply|forward|delete|archive|back|share|more|type a message)$/i;

export function cleanOcrText(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !UI_NOISE.test(l) && /[\p{L}\p{N}]/u.test(l));
  return normalizeInput(lines.join('\n'));
}

/**
 * Tesseract.js OCR. One worker, reused, with jobs serialized (OCR is memory hungry).
 * Language data is downloaded once to STORAGE_DIR/tessdata on first use.
 */
@Injectable()
export class OcrService implements OnApplicationShutdown {
  private readonly logger = new Logger(OcrService.name);
  private worker?: Promise<Worker>;
  private queue: Promise<unknown> = Promise.resolve();

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const langs = env().OCR_LANGS.split(/[+,\s]+/).filter(Boolean);
      const cachePath = resolve(env().STORAGE_DIR, 'tessdata');
      this.worker = mkdir(cachePath, { recursive: true }).then(() => {
        this.logger.log(`Starting Tesseract (${langs.join('+')}); first run downloads language data`);
        return createWorker(langs, 1, { cachePath });
      });
      this.worker.catch(() => (this.worker = undefined));
    }
    return this.worker;
  }

  async recognize(image: Buffer): Promise<OcrResult> {
    const run = async () => {
      const meta = await sharp(image).metadata();
      // Upscale small screenshots, grayscale and normalize contrast: improves recognition noticeably.
      const prepared = await sharp(image)
        .resize({ width: Math.max(meta.width ?? 0, 1500), withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      const worker = await this.getWorker();
      const { data } = await worker.recognize(prepared);
      const text = cleanOcrText(data.text ?? '');
      const confidence = Math.round(data.confidence ?? 0);
      return { text, confidence, lowQuality: confidence < 60 || text.length < 15 };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async onApplicationShutdown() {
    if (this.worker) await (await this.worker).terminate().catch(() => undefined);
  }
}
