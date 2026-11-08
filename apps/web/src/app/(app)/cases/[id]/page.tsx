'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CategoryChip, DateChip, ErrorNote, Spinner, StatusBadge } from '@/components/ui';
import { gql } from '@/lib/api';
import { CATEGORY_LABELS, formatDate, fromDateInput, timeAgo, toDateInput, todayInput, WAITING_ON_LABELS } from '@/lib/format';
import { ADD_NOTE, CASE_DETAIL, CHANGE_STATUS, LOG_FOLLOW_UP, SNOOZE, UPDATE_CASE } from '@/lib/queries';
import type { CaseDetail } from '@/lib/types';

const EVENT_ICONS: Record<string, string> = {
  CREATED: '✦',
  CAPTURE_ATTACHED: '⎘',
  STATUS_CHANGED: '◉',
  FIELD_UPDATED: '✎',
  NOTE_ADDED: '✉',
  FOLLOWED_UP: '↻',
  SNOOZED: '☾',
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['case', id], queryFn: () => gql<{ case: CaseDetail }>(CASE_DETAIL, { id }).then((d) => d.case) });
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  const invalidate = () => qc.invalidateQueries();
  const status = useMutation({ mutationFn: (s: string) => gql(CHANGE_STATUS, { id, status: s }), onSuccess: invalidate });
  const snooze = useMutation({
    mutationFn: (days: number) => gql(SNOOZE, { id, until: new Date(Date.now() + days * 86400_000).toISOString() }),
    onSuccess: invalidate,
  });
  const addNote = useMutation({
    mutationFn: () => gql(ADD_NOTE, { caseId: id, note }),
    onSuccess: () => {
      setNote('');
      invalidate();
    },
  });
  const followUp = useMutation({
    mutationFn: (days: number) => gql(LOG_FOLLOW_UP, { caseId: id, note: note || null, next: new Date(Date.now() + days * 86400_000).toISOString() }),
    onSuccess: () => {
      setNote('');
      invalidate();
    },
  });

  if (q.isPending) return <Spinner className="h-6 w-6" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const c = q.data;
  const active = c.status === 'OPEN' || c.status === 'SNOOZED';
  const error = status.error ?? snooze.error ?? addNote.error ?? followUp.error;

  return (
    <div className="space-y-6">
      <Link href="/cases" className="text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">← Cases</Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{c.title}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {[c.counterpartyName, c.statusLabel, c.amountDisplay].filter(Boolean).join(' · ')}
            </p>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <CategoryChip category={c.category} />
          <span className="chip bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">{WAITING_ON_LABELS[c.waitingOn]}</span>
          {active && <DateChip label="Due" iso={c.deadlineAt} estimated={c.deadlineKind === 'ESTIMATED'} />}
          {active && <DateChip label="Follow up" iso={c.followupAt} />}
          {c.identifiers.map((i) => (
            <span key={i.value} className="chip bg-stone-100 font-mono text-stone-700 dark:bg-stone-800 dark:text-stone-300">#{i.value}</span>
          ))}
        </div>
        {c.nextAction && active && (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-700/15 dark:text-brand-100">Next step: {c.nextAction}</p>
        )}
        {c.deadlineAt && c.deadlineKind === 'ESTIMATED' && c.deadlineEvidence && (
          <p className="mt-2 text-xs text-stone-500">Due date estimated from “{c.deadlineEvidence}”.</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {active ? (
            <>
              <button className="btn-primary" onClick={() => status.mutate('RESOLVED')} disabled={status.isPending}>Mark resolved</button>
              <button className="btn-secondary" onClick={() => snooze.mutate(3)} disabled={snooze.isPending}>Snooze 3 days</button>
              <button className="btn-secondary" onClick={() => setEditing((v) => !v)}>{editing ? 'Close editor' : 'Edit'}</button>
              <button className="btn-danger" onClick={() => status.mutate('CLOSED')} disabled={status.isPending}>Close without resolving</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => status.mutate('OPEN')} disabled={status.isPending}>Reopen</button>
          )}
        </div>
        <div className="mt-3"><ErrorNote error={error} /></div>
      </div>

      {editing && <EditCase c={c} onSaved={() => { setEditing(false); invalidate(); }} />}

      {active && (
        <div className="card space-y-3 p-4">
          <label className="label" htmlFor="note">Add a note or log a follow-up</label>
          <textarea id="note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called customer care, they said 2 more days" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Save note</button>
            <button className="btn-secondary" disabled={followUp.isPending} onClick={() => followUp.mutate(3)}>I followed up · remind me in 3 days</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">Timeline</h2>
        <ol className="relative space-y-4 border-l border-stone-200 pl-6 dark:border-stone-800">
          {c.events.map((e) => {
            const cap = e.captureId ? c.captures.find((x) => x.id === e.captureId) : null;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-8.25 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-brand-600 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
                  {EVENT_ICONS[e.type] ?? '•'}
                </span>
                <p className="text-sm font-medium">{e.summary ?? e.type}</p>
                {e.note && <p className="mt-0.5 text-sm whitespace-pre-wrap text-stone-600 dark:text-stone-300">{e.note}</p>}
                {cap && (
                  <Link href={`/captures/${cap.id}`} className="mt-1 block rounded-xl border border-stone-200 p-2 text-xs text-stone-600 hover:border-brand-500 dark:border-stone-700 dark:text-stone-300">
                    {cap.attachment ? '📷 Screenshot' : '💬'} {(cap.editedText ?? cap.extractedText ?? '').slice(0, 140)}
                    {(cap.editedText ?? cap.extractedText ?? '').length > 140 && '…'}
                  </Link>
                )}
                <p className="mt-0.5 text-xs text-stone-400" title={formatDate(e.createdAt, true)}>{timeAgo(e.createdAt)}</p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function EditCase({ c, onSaved }: { c: CaseDetail; onSaved: () => void }) {
  const [f, setF] = useState({
    title: c.title,
    category: c.category,
    waitingOn: c.waitingOn,
    counterpartyName: c.counterpartyName ?? '',
    amount: c.amount != null ? String(c.amount) : '',
    nextAction: c.nextAction ?? '',
    deadline: toDateInput(c.deadlineAt),
    followup: toDateInput(c.followupAt),
  });
  const save = useMutation({
    mutationFn: () =>
      gql(UPDATE_CASE, {
        id: c.id,
        version: c.version,
        input: {
          title: f.title,
          category: f.category,
          waitingOn: f.waitingOn,
          counterpartyName: f.counterpartyName,
          amount: f.amount,
          nextAction: f.nextAction || null,
          ...(f.deadline !== toDateInput(c.deadlineAt) ? (f.deadline ? { deadlineAt: fromDateInput(f.deadline, 18) } : { clearDeadline: true }) : {}),
          ...(f.followup !== toDateInput(c.followupAt) ? (f.followup ? { followupAt: fromDateInput(f.followup, 10) } : { clearFollowup: true }) : {}),
        },
      }),
    onSuccess: onSaved,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="card grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Title</label><input className="input" value={f.title} onChange={set('title')} /></div>
      <div><label className="label">Category</label>
        <select className="input" value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div><label className="label">Who acts next</label>
        <select className="input" value={f.waitingOn} onChange={set('waitingOn')}>{Object.entries(WAITING_ON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div><label className="label">Company / person</label><input className="input" value={f.counterpartyName} onChange={set('counterpartyName')} /></div>
      <div><label className="label">Amount</label><input className="input" value={f.amount} onChange={set('amount')} inputMode="decimal" /></div>
      <div><label className="label">Deadline</label><input type="date" className="input" value={f.deadline} onChange={set('deadline')} /></div>
      <div><label className="label">Follow up on</label><input type="date" min={todayInput()} className="input" value={f.followup} onChange={set('followup')} /></div>
      <div className="sm:col-span-2"><label className="label">Next step</label><input className="input" value={f.nextAction} onChange={set('nextAction')} /></div>
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Spinner />} Save</button>
      </div>
      <div className="sm:col-span-2"><ErrorNote error={save.error} /></div>
    </div>
  );
}
