'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { gql, newRequestId, rest } from '@/lib/api';
import { MAX_VOICE_SECONDS, toVoiceWav, VoiceRecorder } from '@/lib/audio';
import { CREATE_ATTACHMENT_CAPTURE, CREATE_TEXT_CAPTURE } from '@/lib/queries';
import { ErrorNote, Spinner } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;
const LANG_KEY = 'lifeloop.voiceLanguage';
const EXAMPLES = [
  "Amazon initiated my refund of ₹2,499 yesterday, but I haven't received the money yet.",
  'I gave my laptop for repair at the Dell service center. They said they would call me within three days.',
  'Please submit your PAN card copy for reimbursement processing by Friday.',
];

type Voice = { wav: Blob; seconds: number; url: string };

/** Content handed over from elsewhere (e.g. the phone's share sheet) to pre-fill the box. */
export interface CaptureInitial {
  text?: string;
  image?: File | null;
  audio?: File | null;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The one place users capture things: type, paste, attach a screenshot, or leave a voice note. */
export function CaptureBox({ compact = false, initial }: { compact?: boolean; initial?: CaptureInitial }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const [text, setText] = useState(initial?.text ?? '');
  const [pasted, setPasted] = useState(Boolean(initial?.text && initial.text.length > 40));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [canRecord, setCanRecord] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One id per submission attempt, so a double-click or network retry never creates two captures.
  const requestId = useRef(newRequestId());

  useEffect(() => {
    setCanRecord(VoiceRecorder.supported());
    try {
      if (localStorage.getItem(LANG_KEY) === 'hi') setLanguage('hi');
    } catch {
      /* storage unavailable: keep default */
    }
    return () => recorder.current?.cancel();
  }, []);

  // Shared files arrive once, after the box mounts.
  const initialApplied = useRef(false);
  useEffect(() => {
    if (initialApplied.current || !initial) return;
    initialApplied.current = true;
    if (initial.image) pickFile(initial.image);
    else if (initial.audio) void useAudio(initial.audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);

  function chooseLanguage(l: 'en' | 'hi') {
    setLanguage(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }

  function clearVoice() {
    if (voice) URL.revokeObjectURL(voice.url);
    setVoice(null);
  }

  function pickFile(f: File | null) {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (f && !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setError(new Error('Please choose a PNG, JPEG or WebP screenshot.'));
      return;
    }
    if (f && f.size > MAX_BYTES) {
      setError(new Error('That image is larger than 5 MB.'));
      return;
    }
    if (f) clearVoice();
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function useAudio(blob: Blob) {
    setPreparing(true);
    setError(null);
    try {
      const { wav, seconds } = await toVoiceWav(blob);
      if (wav.size > MAX_BYTES) throw new Error('That voice note is too large.');
      pickFile(null);
      clearVoice();
      setVoice({ wav, seconds, url: URL.createObjectURL(wav) });
    } catch (err) {
      setError(err);
    } finally {
      setPreparing(false);
    }
  }

  async function startRecording() {
    setError(null);
    const r = new VoiceRecorder();
    recorder.current = r;
    try {
      await r.start((blob) => {
        setRecording(false);
        void useAudio(blob);
      });
      setElapsed(0);
      setRecording(true);
    } catch (err) {
      setError(err);
    }
  }

  async function stopRecording() {
    const blob = await recorder.current?.stop();
    setRecording(false);
    if (blob) await useAudio(blob);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      pickFile(img);
      return;
    }
    if (e.clipboardData.getData('text').length > 40) setPasted(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file && !voice && text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      let captureId: string;
      const attachment = file ?? (voice ? new File([voice.wav], 'voice-note.wav', { type: 'audio/wav' }) : null);
      if (attachment) {
        const form = new FormData();
        form.append('file', attachment);
        const up = await rest<{ attachmentId: string }>('/api/uploads', { method: 'POST', body: form });
        const r = await gql<{ createAttachmentCapture: { id: string } }>(CREATE_ATTACHMENT_CAPTURE, {
          input: { attachmentId: up.attachmentId, clientRequestId: requestId.current, note: text.trim() || null, language: voice ? language : null },
        });
        captureId = r.createAttachmentCapture.id;
      } else {
        const r = await gql<{ createTextCapture: { id: string } }>(CREATE_TEXT_CAPTURE, {
          input: { text, source: pasted ? 'PASTE' : 'TEXT', clientRequestId: requestId.current },
        });
        captureId = r.createTextCapture.id;
      }
      requestId.current = newRequestId();
      qc.invalidateQueries({ queryKey: ['captures'] });
      router.push(`/captures/${captureId}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const hasAttachment = Boolean(file || voice);

  return (
    <form onSubmit={onSubmit} className="card p-4">
      {!compact && <h2 className="mb-2 font-semibold">What do you need to keep track of?</h2>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        rows={compact ? 2 : 3}
        maxLength={8000}
        placeholder={hasAttachment ? 'Add a note (optional)' : 'Type it, or paste an email / WhatsApp message…'}
        className="input resize-y text-base"
        aria-label="Capture text"
      />

      {preview && (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Screenshot to upload" className="h-20 w-20 rounded-lg border border-stone-200 object-cover dark:border-stone-700" />
          <div className="text-sm">
            <p className="font-medium">{file?.name}</p>
            <button type="button" className="text-red-600 hover:underline" onClick={() => pickFile(null)}>Remove</button>
          </div>
        </div>
      )}

      {recording && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/40">
          <span className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Recording {fmtTime(elapsed)} / {fmtTime(MAX_VOICE_SECONDS)}
          </span>
          <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={stopRecording}>Stop</button>
        </div>
      )}
      {preparing && (
        <p className="mt-3 flex items-center gap-2 text-sm text-stone-500">
          <Spinner /> Preparing voice note…
        </p>
      )}
      {voice && (
        <div className="mt-3 space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <div className="flex flex-wrap items-center gap-3">
            <audio controls src={voice.url} className="h-9 max-w-full" />
            <span className="text-xs text-stone-500">{fmtTime(voice.seconds)}</span>
            <button type="button" className="text-sm text-red-600 hover:underline" onClick={clearVoice}>Remove</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-stone-500">Spoken in:</span>
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => chooseLanguage(l)}
                className={`rounded-full border px-3 py-0.5 ${language === l ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100' : 'border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-300'}`}
              >
                {l === 'en' ? 'English' : 'Hindi / Hinglish'}
              </button>
            ))}
          </div>
          {language === 'hi' && <p className="text-xs text-stone-500">Written out in Roman letters (Hinglish), like &ldquo;kal mera refund aane wala hai&rdquo;. Takes a little longer than English.</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <input
            ref={audioFileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void useAudio(f);
            }}
          />
          <button type="button" className="btn-secondary" disabled={recording} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm12 12H4l4-5 3 3.5 2-2.5 3 4Zm-9-7.5A1.5 1.5 0 1 1 7 4.5a1.5 1.5 0 0 1 0 3Z" />
            </svg>
            Screenshot
          </button>
          {!recording && (
            <button
              type="button"
              className="btn-secondary"
              disabled={preparing}
              onClick={() => (canRecord ? startRecording() : audioFileRef.current?.click())}
              title={canRecord ? 'Record a voice note (up to 2 minutes)' : 'Upload an audio file'}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
              </svg>
              Voice
            </button>
          )}
          {canRecord && !recording && !voice && (
            <button type="button" className="text-xs text-stone-500 hover:underline" onClick={() => audioFileRef.current?.click()}>
              or upload audio
            </button>
          )}
          {pasted && !hasAttachment && <span className="chip bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">Pasted message</span>}
        </div>
        <button type="submit" className="btn-primary" disabled={busy || recording || preparing || (!hasAttachment && text.trim().length < 3)}>
          {busy && <Spinner />} Track it
        </button>
      </div>
      <ErrorNote error={error} />
      {!compact && !text && !hasAttachment && !recording && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-stone-200 px-3 py-1 text-left text-xs text-stone-600 hover:border-brand-500 hover:text-brand-700 dark:border-stone-700 dark:text-stone-300"
            >
              {ex.length > 60 ? `${ex.slice(0, 57)}…` : ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
