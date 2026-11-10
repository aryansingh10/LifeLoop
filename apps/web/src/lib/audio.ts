/**
 * Browser-side audio helpers. Whatever the browser records (webm/opus, mp4/aac) or the user uploads
 * (mp3, m4a, ogg, wav…) is decoded with the Web Audio API and re-encoded as 16 kHz mono 16-bit WAV,
 * the single format the API accepts and Whisper expects.
 */
export const MAX_VOICE_SECONDS = 120;
const TARGET_RATE = 16_000;

export async function toVoiceWav(input: Blob): Promise<{ wav: Blob; seconds: number }> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await input.arrayBuffer());
  } catch {
    throw new Error("This audio file couldn't be read. Try MP3, M4A, OGG, WAV or record again.");
  } finally {
    void ctx.close();
  }
  if (decoded.duration < 0.5) throw new Error('That voice note is too short.');
  if (decoded.duration > MAX_VOICE_SECONDS + 1) throw new Error(`Voice notes can be up to ${MAX_VOICE_SECONDS / 60} minutes long.`);

  // Resample + mix down to mono in one pass.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_RATE), TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return { wav: encodeWav(rendered.getChannelData(0), TARGET_RATE), seconds: decoded.duration };
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Turns getUserMedia failures into a message that says what is actually wrong. */
export function microphoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  const detail = err instanceof Error ? err.message : '';
  console.warn('Microphone error:', name, detail);
  const upload = ' You can also use "or upload audio" instead.';
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect a headset, or turn on your computer\'s microphone (Windows: Settings → System → Sound → Input), then try again.' + upload;
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return /system/i.test(detail)
        ? 'Your operating system is blocking the microphone for this browser (Windows: Settings → Privacy & security → Microphone).' + upload
        : 'Microphone permission was denied. Click the icon at the left of the address bar, allow the microphone, and try again.' + upload;
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'The microphone is busy or unavailable. Close other apps that may be using it (calls, recorders) and try again.' + upload;
    default:
      return `The microphone couldn't be started${name ? ` (${name})` : ''}.` + upload;
  }
}

/** Simple recorder wrapper around MediaRecorder with an automatic stop at the time limit. */
export class VoiceRecorder {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;

  static supported(): boolean {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  async start(onAutoStop: (blob: Blob) => void): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      throw new Error(microphoneErrorMessage(err));
    }
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
    this.timer = setTimeout(() => void this.stop().then(onAutoStop), MAX_VOICE_SECONDS * 1000);
  }

  stop(): Promise<Blob> {
    clearTimeout(this.timer);
    return new Promise((resolve) => {
      const r = this.recorder;
      if (!r || r.state === 'inactive') return resolve(new Blob(this.chunks));
      r.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: r.mimeType }));
      };
      r.stop();
    });
  }

  cancel() {
    clearTimeout(this.timer);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
