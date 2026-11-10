/**
 * Voice notes arrive as 16 kHz, 16-bit, mono PCM WAV: the browser converts any recording or audio file
 * to this one format, so the server never needs ffmpeg or codec libraries. Everything else is rejected.
 * Uploaded bytes are untrusted, so the header is parsed strictly with bounds checks.
 */
export const VOICE_SAMPLE_RATE = 16_000;
export const MAX_VOICE_SECONDS = 120;

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
  durationMs: number;
}

export function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > buf.length) return null;
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt) return null;
      const dataLength = Math.min(size, buf.length - body); // tolerate streaming writers that leave size unset
      if (dataLength <= 0) return null;
      const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bits / 8);
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: fmt.bits,
        dataOffset: body,
        dataLength: dataLength - (dataLength % 2),
        durationMs: Math.round((dataLength / bytesPerSecond) * 1000),
      };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Returns a human-readable problem, or null if the WAV is an acceptable voice note. */
export function voiceNoteProblem(info: WavInfo | null): string | null {
  if (!info) return 'This audio file could not be read.';
  if (info.channels !== 1 || info.sampleRate !== VOICE_SAMPLE_RATE || info.bitsPerSample !== 16) {
    return 'Unsupported audio format. Please record or upload again from the app.';
  }
  if (info.durationMs < 500) return 'That voice note is too short.';
  if (info.durationMs > (MAX_VOICE_SECONDS + 1) * 1000) return `Voice notes can be up to ${MAX_VOICE_SECONDS / 60} minutes long.`;
  return null;
}

/** 16-bit PCM -> Float32 samples in [-1, 1], as Whisper expects. */
export function wavToFloat32(buf: Buffer, info: WavInfo): Float32Array {
  const n = Math.floor(info.dataLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(info.dataOffset + i * 2) / 32768;
  return out;
}
