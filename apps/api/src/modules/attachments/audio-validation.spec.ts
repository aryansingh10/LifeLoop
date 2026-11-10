import { cleanTranscript } from '../transcription/transcription.service.js';
import { parseWav, voiceNoteProblem, wavToFloat32 } from './audio-validation.js';

function wav(seconds: number, { rate = 16000, channels = 1, bits = 16 } = {}): Buffer {
  const dataLen = Math.round(seconds * rate) * channels * (bits / 8);
  const b = Buffer.alloc(44 + dataLen);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataLen, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE((rate * channels * bits) / 8, 28);
  b.writeUInt16LE((channels * bits) / 8, 32);
  b.writeUInt16LE(bits, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataLen, 40);
  if (dataLen >= 4) {
    b.writeInt16LE(16384, 44); // +0.5
    b.writeInt16LE(-32768, 46); // -1.0
  }
  return b;
}

describe('voice note validation', () => {
  it('accepts 16 kHz mono 16-bit WAV and measures its length', () => {
    const info = parseWav(wav(3));
    expect(info?.durationMs).toBe(3000);
    expect(voiceNoteProblem(info)).toBeNull();
  });

  it('rejects other formats, very short and too long notes', () => {
    expect(voiceNoteProblem(parseWav(wav(3, { rate: 44100 })))).toMatch(/Unsupported/);
    expect(voiceNoteProblem(parseWav(wav(3, { channels: 2 })))).toMatch(/Unsupported/);
    expect(voiceNoteProblem(parseWav(wav(0.2)))).toMatch(/too short/);
    expect(voiceNoteProblem(parseWav(wav(125)))).toMatch(/up to 2 minutes/);
  });

  it('rejects files that only pretend to be WAV', () => {
    expect(parseWav(Buffer.from('RIFF\0\0\0\0WAVEjunkjunkjunkjunkjunkjunkjunkjunkjunkjunk'))).toBeNull();
    expect(parseWav(Buffer.from('not audio at all, definitely not a wav file header'))).toBeNull();
    const truncated = wav(1).subarray(0, 30); // header cut off
    expect(parseWav(truncated)).toBeNull();
  });

  it('converts samples to floats for Whisper', () => {
    const b = wav(1);
    const f = wavToFloat32(b, parseWav(b)!);
    expect(f[0]).toBeCloseTo(0.5);
    expect(f[1]).toBe(-1);
  });

  it('removes Whisper non-speech markers from transcripts', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] ')).toBe('');
    expect(cleanTranscript('(music) Amazon refund is pending ♪')).toBe('Amazon refund is pending');
  });
});
