'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { gql } from '@/lib/api';
import { CATEGORY_LABELS, formatDate, fromDateInput, toDateInput, todayInput, WAITING_ON_LABELS } from '@/lib/format';
import { APPROVE, ATTACH, REJECT } from '@/lib/queries';
import type { Suggestion } from '@/lib/types';
import { CaseCard, ConfidenceBadge, ErrorNote, Spinner } from './ui';

const KIND_TITLES: Record<Suggestion['kind'], string> = {
  NEW_CASE: 'New thing to track',
  UPDATE_CASE: 'Update to something you track',
  DUPLICATE: 'You already shared this',
  NOT_ACTIONABLE: 'Nothing to track here',
};

/** Highlights evidence quotes inside the source text so users can see where each value came from. */
export function HighlightedText({ text, quotes }: { text: string; quotes: string[] }) {
  const parts = useMemo(() => {
    const ranges: Array<[number, number]> = [];
    const lower = text.toLowerCase();
    for (const q of quotes) {
      const needle = q.trim().toLowerCase();
      if (needle.length < 2) continue;
      const i = lower.indexOf(needle);
      if (i >= 0) ranges.push([i, i + needle.length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    const out: Array<{ t: string; hl: boolean }> = [];
    let pos = 0;
    for (const [s, e] of merged) {
      if (s > pos) out.push({ t: text.slice(pos, s), hl: false });
      out.push({ t: text.slice(s, e), hl: true });
      pos = e;
    }
    if (pos < text.length) out.push({ t: text.slice(pos), hl: false });
    return out;
  }, [text, quotes]);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-300">
      {parts.map((p, i) =>
        p.hl ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-inherit dark:bg-amber-900/60">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </p>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function SuggestionReview({ suggestion: s, sourceText, onDone }: { suggestion: Suggestion; sourceText: string; onDone?: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const p = s.proposed;
  const initial = useMemo(
    () => ({
      title: p.title,
      category: p.category ?? 'OTHER',
      waitingOn: p.waitingOn,
      counterpartyName: p.counterparty?.value ?? '',
      amount: p.amount ? String(p.amount.amount) : '',
      nextAction: p.nextAction?.value ?? '',
      deadline: toDateInput(p.deadline?.at),
      followup: toDateInput(p.suggestedFollowupAt),
    }),
    [p],
  );
  const [form, setForm] = useState(initial);
  const [showWhy, setShowWhy] = useState(false);
  const [editing, setEditing] = useState(s.confidenceBand !== 'HIGH' && s.kind === 'NEW_CASE');
  const [chosenCase, setChosenCase] = useState<string | null>(s.targetCaseId);
  const completes = p.classification === 'COMPLETED' || ['REFUND_COMPLETED', 'PAYMENT_SUCCESS', 'REQUEST_RESOLVED', 'DELIVERED'].includes(p.lifecycleStage ?? '');
  const [resolveCase, setResolveCase] = useState(completes);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function edits() {
    const e: Record<string, unknown> = {};
    if (form.title !== initial.title) e.title = form.title;
    if (form.category !== initial.category) e.category = form.category;
    if (form.waitingOn !== initial.waitingOn) e.waitingOn = form.waitingOn;
    if (form.counterpartyName !== initial.counterpartyName) e.counterpartyName = form.counterpartyName;
    if (form.amount !== initial.amount) e.amount = form.amount;
    if (form.nextAction !== initial.nextAction) e.nextAction = form.nextAction;
    if (form.deadline !== initial.deadline) {
      if (form.deadline) e.deadlineAt = fromDateInput(form.deadline, 18);
      else e.clearDeadline = true;
    }
    if (form.followup !== initial.followup) {
      if (form.followup) e.followupAt = fromDateInput(form.followup, 10);
      else e.clearFollowup = true;
    }
    return Object.keys(e).length ? e : null;
  }

  const done = (caseId?: string | null) => {
    qc.invalidateQueries();
    if (onDone) onDone();
    else if (caseId) router.push(`/cases/${caseId}`);
  };

  const approve = useMutation({
    mutationFn: (opts: { forceNew?: boolean } = {}) =>
      gql<{ approveSuggestion: { case: { id: string } | null } }>(APPROVE, {
        id: s.id,
        edits: s.kind === 'UPDATE_CASE' && !opts.forceNew ? null : edits(),
        resolveCase: s.kind === 'UPDATE_CASE' ? resolveCase : null,
        forceNew: opts.forceNew ?? null,
      }),
    onSuccess: (r) => done(r.approveSuggestion.case?.id),
  });
  const attach = useMutation({
    mutationFn: (caseId: string) => gql<{ attachSuggestionToCase: { case: { id: string } | null } }>(ATTACH, { id: s.id, caseId, resolveCase }),
    onSuccess: (r) => done(r.attachSuggestionToCase.case?.id),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => gql(REJECT, { id: s.id, reason }),
    onSuccess: () => done(null),
  });
  const busy = approve.isPending || attach.isPending || reject.isPending;
  const error = approve.error ?? attach.error ?? reject.error;

  const quotes = [
    p.lifecycleEvidence,
    p.counterparty?.evidence,
    p.amount?.evidence,
    p.deadline?.evidence,
    p.eventDate?.evidence,
    p.nextAction?.evidence,
    ...p.identifiers.map((i) => i.evidence),
  ].filter((q): q is string => Boolean(q));

  const reviewed = s.status !== 'PENDING';
  const otherCandidates = s.candidates.filter((c) => c.case.id !== s.targetCaseId);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h3 className="font-semibold">{KIND_TITLES[s.kind]}</h3>
        <div className="flex items-center gap-2">
          {(s.kind === 'NEW_CASE' || s.kind === 'UPDATE_CASE') && <ConfidenceBadge band={s.confidenceBand} />}
          <button className="text-xs text-stone-500 underline-offset-2 hover:underline" onClick={() => setShowWhy((v) => !v)}>
            {showWhy ? 'Hide details' : 'Why?'}
          </button>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Source with evidence */}
        <div className="border-b border-stone-200 bg-stone-50 p-5 md:border-r md:border-b-0 dark:border-stone-800 dark:bg-stone-950/40">
          <span className="label">What you shared</span>
          <HighlightedText text={sourceText} quotes={quotes} />
          <p className="mt-3 text-xs text-stone-500">Highlighted text is what LifeLoop based the details on.</p>
        </div>

        {/* Proposal */}
        <div className="space-y-4 p-5">
          {s.kind === 'UPDATE_CASE' && s.targetCase && (
            <div className="space-y-2">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {s.candidates.find((c) => c.case.id === s.targetCaseId)?.strength === 'STRONG' ? 'This matches:' : 'Is this about…?'}
              </p>
              <CaseCard c={s.targetCase} />
              {p.statusLabel && (
                <p className="text-sm">
                  New status: <strong>{p.statusLabel}</strong>
                </p>
              )}
            </div>
          )}

          {s.kind === 'DUPLICATE' && (
            <p className="text-sm text-stone-600 dark:text-stone-300">
              This is identical to something you shared before.{' '}
              {s.targetCaseId && (
                <Link className="font-medium text-brand-600" href={`/cases/${s.targetCaseId}`}>
                  Open the case
                </Link>
              )}
            </p>
          )}

          {s.kind === 'NOT_ACTIONABLE' && (
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {p.classification === 'COMPLETED'
                ? 'This looks like something that is already done.'
                : p.classification === 'INFORMATIONAL'
                  ? 'This looks informational — there is nothing pending.'
                  : "We couldn't find anything that needs following up."}{' '}
              You can still track it if you want.
            </p>
          )}

          {(s.kind === 'NEW_CASE' || ((s.kind === 'NOT_ACTIONABLE' || s.kind === 'DUPLICATE') && editing)) &&
            (editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Title">
                    <input className="input" value={form.title} onChange={set('title')} maxLength={200} />
                  </Field>
                </div>
                <Field label="Category">
                  <select className="input" value={form.category} onChange={set('category')}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Who acts next">
                  <select className="input" value={form.waitingOn} onChange={set('waitingOn')}>
                    {Object.entries(WAITING_ON_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Company / person">
                  <input className="input" value={form.counterpartyName} onChange={set('counterpartyName')} placeholder="Not stated" />
                </Field>
                <Field label="Amount">
                  <input className="input" value={form.amount} onChange={set('amount')} placeholder="Not stated" inputMode="decimal" />
                </Field>
                <Field
                  label="Deadline"
                  hint={
                    p.deadline && form.deadline === initial.deadline
                      ? p.deadline.kind === 'ESTIMATED'
                        ? `Estimated from “${p.deadline.expression}”`
                        : `From “${p.deadline.expression}”`
                      : !form.deadline
                        ? 'No deadline was mentioned'
                        : undefined
                  }
                >
                  <input type="date" className="input" value={form.deadline} onChange={set('deadline')} />
                </Field>
                <Field label="Remind me to follow up" hint={form.followup && form.followup === initial.followup ? 'Suggested by LifeLoop' : undefined}>
                  <input type="date" min={todayInput()} className="input" value={form.followup} onChange={set('followup')} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Next step">
                    <input className="input" value={form.nextAction} onChange={set('nextAction')} />
                  </Field>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-stone-500">Title</dt>
                <dd className="font-medium">{p.title}</dd>
                <dt className="text-stone-500">Type</dt>
                <dd>{CATEGORY_LABELS[p.category ?? 'OTHER']}{p.statusLabel && ` · ${p.statusLabel}`}</dd>
                <dt className="text-stone-500">Next</dt>
                <dd>{WAITING_ON_LABELS[p.waitingOn]}{p.counterparty && ` — ${p.counterparty.value}`}</dd>
                {p.amount && (<><dt className="text-stone-500">Amount</dt><dd>{p.amount.display}</dd></>)}
                {p.identifiers.length > 0 && (<><dt className="text-stone-500">Reference</dt><dd>{p.identifiers.map((i) => i.value).join(', ')}</dd></>)}
                <dt className="text-stone-500">Deadline</dt>
                <dd>
                  {p.deadline ? (
                    <>
                      {formatDate(p.deadline.at)}{' '}
                      {p.deadline.kind === 'ESTIMATED' && <span className="text-stone-500">(estimated from “{p.deadline.expression}”)</span>}
                    </>
                  ) : (
                    <span className="text-stone-500">None mentioned</span>
                  )}
                </dd>
                {p.suggestedFollowupAt && (<><dt className="text-stone-500">Follow up</dt><dd>{formatDate(p.suggestedFollowupAt)} <span className="text-stone-500">(suggested)</span></dd></>)}
              </dl>
            ))}

          {p.uncertainties.length > 0 && s.kind !== 'DUPLICATE' && (
            <ul className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              {p.uncertainties.map((u) => (
                <li key={u}>• {u}</li>
              ))}
            </ul>
          )}

          {otherCandidates.length > 0 && !reviewed && (
            <div className="space-y-2">
              <span className="label">{s.kind === 'UPDATE_CASE' ? 'Or is it about' : 'This might be about'}</span>
              {otherCandidates.map((c) => (
                <label key={c.case.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-200 p-3 text-sm hover:border-brand-500 dark:border-stone-700">
                  <input type="radio" name={`cand-${s.id}`} className="mt-1" checked={chosenCase === c.case.id} onChange={() => setChosenCase(c.case.id)} />
                  <span>
                    <span className="font-medium">{c.case.title}</span>
                    <span className="block text-xs text-stone-500">{c.reasons.join(' · ')}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {(s.kind === 'UPDATE_CASE' || (chosenCase && chosenCase !== s.targetCaseId)) && !reviewed && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={resolveCase} onChange={(e) => setResolveCase(e.target.checked)} />
              Mark the case as resolved
            </label>
          )}

          <ErrorNote error={error} />

          {reviewed ? (
            <p className="text-sm text-stone-500">This suggestion was {s.status.toLowerCase()}.</p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {s.kind === 'NEW_CASE' && (
                <>
                  <button className="btn-primary" disabled={busy} onClick={() => approve.mutate({})}>
                    {approve.isPending && <Spinner />} {edits() ? 'Save & track' : 'Track this'}
                  </button>
                  {!editing && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
                </>
              )}
              {s.kind === 'UPDATE_CASE' && (
                <>
                  {chosenCase && chosenCase !== s.targetCaseId ? (
                    <button className="btn-primary" disabled={busy} onClick={() => attach.mutate(chosenCase)}>
                      {attach.isPending && <Spinner />} Add to selected case
                    </button>
                  ) : (
                    <button className="btn-primary" disabled={busy} onClick={() => approve.mutate({})}>
                      {approve.isPending && <Spinner />} {resolveCase ? 'Update & resolve' : 'Add to this case'}
                    </button>
                  )}
                  <button className="btn-secondary" disabled={busy} onClick={() => approve.mutate({ forceNew: true })}>
                    It's something new
                  </button>
                </>
              )}
              {s.kind === 'NEW_CASE' && chosenCase && (
                <button className="btn-secondary" disabled={busy} onClick={() => attach.mutate(chosenCase)}>
                  Add to selected case instead
                </button>
              )}
              {(s.kind === 'NOT_ACTIONABLE' || s.kind === 'DUPLICATE') &&
                (editing ? (
                  <button className="btn-primary" disabled={busy} onClick={() => approve.mutate({})}>
                    {approve.isPending && <Spinner />} Track it
                  </button>
                ) : (
                  <>
                    {chosenCase && (
                      <button className="btn-primary" disabled={busy} onClick={() => attach.mutate(chosenCase)}>
                        Add to selected case
                      </button>
                    )}
                    <button className="btn-secondary" disabled={busy} onClick={() => setEditing(true)}>
                      Track anyway
                    </button>
                  </>
                ))}
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={() => reject.mutate(s.kind === 'DUPLICATE' ? 'DUPLICATE' : s.kind === 'NOT_ACTIONABLE' ? 'NOT_A_COMMITMENT' : 'WRONG_DETAILS')}
              >
                {s.kind === 'NEW_CASE' || s.kind === 'UPDATE_CASE' ? 'Not useful' : 'Dismiss'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showWhy && (
        <div className="border-t border-stone-200 px-5 py-4 text-sm dark:border-stone-800">
          <p className="mb-2 text-stone-500">
            Confidence {Math.round(s.confidenceScore * 100)}/100 — a rule-based estimate, not a guarantee.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {s.confidenceFactors.map((f) => (
              <li key={f.key} className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                  <span className="block h-full bg-brand-500" style={{ width: `${Math.round(f.value * 100)}%` }} />
                </span>
                <span>
                  {f.label}: <span className="text-stone-500">{f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
