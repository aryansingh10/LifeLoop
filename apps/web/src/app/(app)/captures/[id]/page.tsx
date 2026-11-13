'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SuggestionReview } from '@/components/suggestion-review';
import { ErrorNote, Spinner } from '@/components/ui';
import { gql } from '@/lib/api';
import { FAILURE_MESSAGES, timeAgo } from '@/lib/format';
import { CAPTURE_DETAIL, REPROCESS_CAPTURE, RETRY_CAPTURE } from '@/lib/queries';
import type { Capture, Suggestion } from '@/lib/types';

type CaptureDetail = Capture & { suggestion: Suggestion | null };

const PROCESSING = new Set(['RECEIVED', 'PREPROCESSING', 'EXTRACTING']);

export default function CapturePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const q = useQuery({
    queryKey: ['capture', id],
    queryFn: () => gql<{ capture: CaptureDetail }>(CAPTURE_DETAIL, { id }).then((d) => d.capture),
    refetchInterval: (query) => {
      const c = query.state.data;
      if (!c || !PROCESSING.has(c.status)) return false;
      return Date.now() - new Date(c.createdAt).getTime() > 120_000 ? 10_000 : 1500;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['capture', id] });
  const reprocess = useMutation({
    mutationFn: () => gql(REPROCESS_CAPTURE, { id, text: draft }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
  });
  const retry = useMutation({ mutationFn: () => gql(RETRY_CAPTURE, { id }), onSuccess: refresh });

  if (q.isPending) return <Spinner className="h-6 w-6" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const c = q.data;
  const text = c.editedText ?? c.extractedText ?? '';
  const lowOcr = c.source === 'SCREENSHOT' && c.ocrConfidence != null && c.ocrConfidence < 60;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">← Home</Link>
        <span className="text-xs text-stone-500">Captured {timeAgo(c.createdAt)}</span>
      </div>

      {PROCESSING.has(c.status) && (
        <div className="card flex items-center gap-3 p-6">
          <Spinner className="h-5 w-5 text-brand-600" />
          <div>
            <p className="font-medium">
              {c.status !== 'PREPROCESSING'
                ? 'Working out what needs to happen next…'
                : c.source === 'VOICE'
                  ? 'Transcribing your voice note…'
                  : 'Reading your screenshot…'}
            </p>
            <p className="text-sm text-stone-500">
              {c.source === 'VOICE'
                ? 'Usually a few seconds per 10 seconds of audio (the very first voice note also downloads the speech model, about a minute).'
                : `This usually takes a few seconds${c.source === 'SCREENSHOT' ? ' (the first screenshot can take longer)' : ''}.`}
            </p>
          </div>
        </div>
      )}

      {c.status === 'FAILED' && (
        <div className="card space-y-3 p-6">
          <p className="font-medium">{FAILURE_MESSAGES[c.failureCode ?? ''] ?? 'Something went wrong while processing this.'}</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => retry.mutate()} disabled={retry.isPending}>Retry</button>
            {text && <button className="btn-secondary" onClick={() => { setDraft(text); setEditing(true); }}>Edit text</button>}
          </div>
          <ErrorNote error={retry.error} />
        </div>
      )}

      {c.attachment && (
        <div className="card p-4">
          {c.attachment.kind === 'AUDIO' ? (
            <>
              <span className="label">Voice note</span>
              <audio controls src={c.attachment.url} className="w-full max-w-md" />
              {c.language === 'hi' && <p className="mt-2 text-xs text-stone-500">Spoken in Hindi/Hinglish — written below in Roman letters.</p>}
            </>
          ) : (
            <>
              <span className="label">Screenshot</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.attachment.url} alt="Uploaded screenshot" className="max-h-96 rounded-lg border border-stone-200 dark:border-stone-700" />
            </>
          )}
          {c.note && <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">Note: {c.note}</p>}
        </div>
      )}

      {lowOcr && !PROCESSING.has(c.status) && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          We couldn&apos;t read this screenshot clearly ({Math.round(c.ocrConfidence ?? 0)}% confidence). Please check the text below and correct it if needed.
        </p>
      )}

      {editing ? (
        <div className="card space-y-3 p-4">
          <span className="label">Correct the text</span>
          <textarea className="input min-h-40 text-base" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => reprocess.mutate()} disabled={reprocess.isPending || draft.trim().length < 3}>
              {reprocess.isPending && <Spinner />} Re-check
            </button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <ErrorNote error={reprocess.error} />
        </div>
      ) : (
        c.suggestion &&
        !PROCESSING.has(c.status) && (
          <>
            <SuggestionReview suggestion={c.suggestion} sourceText={text} onDone={refresh} />
            {c.suggestion.status === 'PENDING' && text && (
              <button className="text-sm text-stone-500 hover:underline" onClick={() => { setDraft(text); setEditing(true); }}>
                {c.source === 'SCREENSHOT' || c.source === 'VOICE' ? 'Text wrong? Correct it and re-check' : 'Edit the text and re-check'}
              </button>
            )}
          </>
        )
      )}

      {c.suggestion && c.suggestion.status !== 'PENDING' && (
        <p className="text-sm">
          <Link href="/dashboard" className="font-medium text-brand-600">Back to home</Link>
        </p>
      )}
    </div>
  );
}
