'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { gql, newRequestId, rest } from '@/lib/api';
import { CREATE_SCREENSHOT_CAPTURE, CREATE_TEXT_CAPTURE } from '@/lib/queries';
import { ErrorNote, Spinner } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;
const EXAMPLES = [
  "Amazon initiated my refund of ₹2,499 yesterday, but I haven't received the money yet.",
  'I gave my laptop for repair at the Dell service center. They said they would call me within three days.',
  'Please submit your PAN card copy for reimbursement processing by Friday.',
];

/** The one place users capture things: type, paste, or attach a screenshot. Nothing else is required. */
export function CaptureBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [pasted, setPasted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One id per submission attempt, so a double-click or network retry never creates two captures.
  const requestId = useRef(newRequestId());

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
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
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
    if (!file && text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      let captureId: string;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const up = await rest<{ attachmentId: string }>('/api/uploads', { method: 'POST', body: form });
        const r = await gql<{ createScreenshotCapture: { id: string } }>(CREATE_SCREENSHOT_CAPTURE, {
          input: { attachmentId: up.attachmentId, clientRequestId: requestId.current, note: text.trim() || null },
        });
        captureId = r.createScreenshotCapture.id;
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

  return (
    <form onSubmit={onSubmit} className="card p-4">
      {!compact && <h2 className="mb-2 font-semibold">What do you need to keep track of?</h2>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        rows={compact ? 2 : 3}
        maxLength={8000}
        placeholder={file ? 'Add a note (optional)' : 'Type it, or paste an email / WhatsApp message…'}
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm12 12H4l4-5 3 3.5 2-2.5 3 4Zm-9-7.5A1.5 1.5 0 1 1 7 4.5a1.5 1.5 0 0 1 0 3Z" />
            </svg>
            Screenshot
          </button>
          {pasted && !file && <span className="chip bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">Pasted message</span>}
        </div>
        <button type="submit" className="btn-primary" disabled={busy || (!file && text.trim().length < 3)}>
          {busy && <Spinner />} Track it
        </button>
      </div>
      <ErrorNote error={error} />
      {!compact && !text && !file && (
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
