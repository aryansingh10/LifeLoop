import { Injectable, Logger } from '@nestjs/common';
import { resolve } from 'node:path';
import { env } from '../../config/env.js';
import { parseWav, wavToFloat32 } from '../attachments/audio-validation.js';
import { romanizeHinglish } from '../extraction/hinglish.js';
import { normalizeInput } from '../extraction/text.js';

export type VoiceLanguage = 'en' | 'hi';

export interface TranscriptionResult {
  text: string;
  /** True when Hindi/Hinglish speech was written out in Roman letters (Hinglish). */
  romanized: boolean;
  model: string;
}

/** Whisper sometimes emits markers instead of words for silence/noise. */
const NON_SPEECH = /\[(?:BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE)\]|\((?:music|silence|inaudible|noise)\)|♪+/gi;

export function cleanTranscript(text: string): string {
  return normalizeInput(
    text
      .replace(NON_SPEECH, ' ')
      // Small models sometimes get stuck repeating: "अपना अपना अपना …", "वावावावा…". Keep one.
      .replace(/(\S+)(?:\s+\1){3,}/gu, '$1')
      .replace(/([^\s\d]{1,3}?)\1{5,}/gu, '$1'), // never digits: "1000000" must stay
  );
}

type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;

/**
 * Speech-to-text with OpenAI's open-source Whisper model running locally (transformers.js / ONNX).
 * Free and private: audio never leaves this machine. Models download once to STORAGE_DIR/models.
 * Jobs run one at a time because the models are memory-hungry.
 *
 * - English: WHISPER_MODEL (base by default), transcribed as spoken.
 * - Hindi/Hinglish: WHISPER_HINDI_MODEL (large-v3-turbo by default), transcribed as Hindi — which Whisper writes
 *   mostly in Hindi script — then turned into Roman Hinglish ("kal mera Myntra ka refund aane wala hai") so
 *   the same extraction rules apply. Translating to English instead made small models invent sentences.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger('Transcription');
  private readonly models = new Map<string, Promise<AsrPipeline>>();
  private queue: Promise<unknown> = Promise.resolve();

  modelFor(language: VoiceLanguage): string {
    return language === 'hi' ? env().WHISPER_HINDI_MODEL : env().WHISPER_MODEL;
  }

  private load(name: string): Promise<AsrPipeline> {
    let model = this.models.get(name);
    if (!model) {
      model = (async () => {
        const { pipeline, env: hf } = await import('@huggingface/transformers');
        hf.cacheDir = resolve(env().STORAGE_DIR, 'models');
        this.logger.log(`Loading ${name} (first run downloads it)`);
        const asr = await pipeline('automatic-speech-recognition', name, { dtype: 'q8' });
        return asr as unknown as AsrPipeline;
      })();
      model.catch(() => this.models.delete(name));
      this.models.set(name, model);
    }
    return model;
  }

  async transcribe(wav: Buffer, language: VoiceLanguage): Promise<TranscriptionResult> {
    const run = async () => {
      const info = parseWav(wav);
      if (!info) throw new Error('Invalid WAV');
      const hindi = language === 'hi';
      const name = this.modelFor(language);
      const asr = await this.load(name);
      const out = await asr(wavToFloat32(wav, info), {
        language: hindi ? 'hindi' : 'english',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const raw = cleanTranscript(Array.isArray(out) ? out.map((o) => o.text).join(' ') : (out.text ?? ''));
      return { text: hindi ? normalizeInput(romanizeHinglish(raw)) : raw, romanized: hindi, model: name };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
