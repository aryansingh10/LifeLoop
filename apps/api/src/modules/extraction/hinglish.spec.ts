import { mockExtract } from '../ai/mock.provider.js';
import { cleanTranscript } from '../transcription/transcription.service.js';
import { hindiNumbersToDigits, romanizeHinglish } from './hinglish.js';
import { validateExtraction } from './validate.js';

const NOW = new Date('2026-11-10T06:00:00Z');
const extract = (hindi: string) => {
  const text = cleanTranscript(romanizeHinglish(cleanTranscript(hindi)));
  return { text, p: validateExtraction(mockExtract(text), { source: text, capturedAt: NOW, timeZone: 'Asia/Kolkata', now: NOW }).proposed };
};

describe('Hinglish voice transcripts (Hindi script -> Roman Hinglish)', () => {
  it('real voice notes: Whisper large-v3-turbo output becomes a correct refund', () => {
    const a = extract('कल मेरा मिंत्रा का एक रिफण आने वाला है पांसो रूपे का');
    expect(a.text).toBe('kal mera Myntra ka ek refund aane wala hai 500 rupees ka');
    expect(a.p).toMatchObject({ isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY' });
    expect(a.p.counterparty?.name).toBe('Myntra');
    expect(a.p.amount?.amountMinor).toBe(50000);
    expect(a.p.deadline?.kind).toBe('EXPLICIT');
    const b = extract('कल मेरा Amazon का एक refund आने वाला है 500 रूपीस का');
    expect(b.text).toBe('kal mera Amazon ka ek refund aane wala hai 500 rupees ka');
    expect(b.p.counterparty?.name).toBe('Amazon');
  });

  it('transliterates other words the way Hinglish is typed', () => {
    expect(romanizeHinglish('समझना करना मिलना विक्रम प्रिया')).toBe('samajhna karna milna vikram priya');
    expect(romanizeHinglish('राहुल ने बोला')).toBe('Rahul ne bola');
    expect(romanizeHinglish('Flipkart order already Latin')).toBe('Flipkart order already Latin');
  });

  it('turns Hindi number words into digits', () => {
    expect(hindiNumbersToDigits('paanch sau rupees')).toBe('500 rupees');
    expect(hindiNumbersToDigits('do hazaar paanch sau')).toBe('2500');
    expect(hindiNumbersToDigits('dedh lakh')).toBe('1.5 lakh');
    expect(romanizeHinglish('राहुल ने बोला था दो हज़ार रुपये कल तक दे देगा')).toBe('Rahul ne bola tha 2000 rupees kal tak de dega');
  });

  it('"kal" is tomorrow in a future sentence and not a deadline in a past one', () => {
    expect(extract('कल मेरा फ्लिपकार्ट का ऑर्डर आने वाला है').p.deadline?.kind).toBe('EXPLICIT');
    expect(extract('कल मेरा फ्लिपकार्ट का ऑर्डर आया था').p.deadline).toBeNull();
  });

  it('collapses Whisper repetition loops but never numbers', () => {
    expect(cleanTranscript('अपना अपना अपना अपना अपना')).toBe('अपना');
    expect(cleanTranscript('वोडावावावावावावावावा')).toBe('वोडावा');
    expect(cleanTranscript('refund of 1000000 rupees')).toBe('refund of 1000000 rupees');
  });
});
