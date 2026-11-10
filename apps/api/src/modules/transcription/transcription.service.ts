import { Injectable, Logger } from '@nestjs/common';
import { resolve } from 'node:path';
import { env } from '../../config/env.js';
import { parseWav, wavToFloat32 } from '../attachments/audio-validation.js';
import { normalizeInput } from '../extraction/text.js';

export type VoiceLanguage = 'en' | 'hi';

export interface TranscriptionResult {
  text: string;
  /** True when Hindi/Hinglish speech was translated into English text. */
  translated: boolean;
  model: string;
}

/** Whisper sometimes emits markers instead of words for silence/noise. */
const NON_SPEECH = /\[(?:BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE)\]|\((?:music|silence|inaudible|noise)\)|♪+/gi;

export function cleanTranscript(text: string): string {
  return normalizeInput(text.replace(NON_SPEECH, ' '));
}

type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;

/**
 * Speech-to-text with OpenAI's open-source Whisper model running locally (transformers.js / ONNX).
 * Free and private: audio never leaves this machine. The model (~150 MB) downloads once to
 * STORAGE_DIR/models. Jobs run one at a time because the model is memory-hungry.
 * English is transcribed as spoken; Hindi/Hinglish is translated to English, which extraction handles best.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger('Transcription');
  private model?: Promise<AsrPipeline>;
  private queue: Promise<unknown> = Promise.resolve();

  get modelName(): string {
    return env().WHISPER_MODEL;
  }

  private load(): Promise<AsrPipeline> {
    if (!this.model) {
      this.model = (async () => {
        const { pipeline, env: hf } = await import('@huggingface/transformers');
        hf.cacheDir = resolve(env().STORAGE_DIR, 'models');
        this.logger.log(`Loading ${this.modelName} (first run downloads it)`);
        const asr = await pipeline('automatic-speech-recognition', this.modelName, { dtype: 'q8' });
        return asr as unknown as AsrPipeline;
      })();
      this.model.catch(() => (this.model = undefined));
    }
    return this.model;
  }

  async transcribe(wav: Buffer, language: VoiceLanguage): Promise<TranscriptionResult> {
    const run = async () => {
      const info = parseWav(wav);
      if (!info) throw new Error('Invalid WAV');
      const asr = await this.load();
      const hindi = language === 'hi';
      const out = await asr(wavToFloat32(wav, info), {
        language: hindi ? 'hindi' : 'english',
        task: hindi ? 'translate' : 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
      return { text: cleanTranscript(text ?? ''), translated: hindi, model: this.modelName };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
