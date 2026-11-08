'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { CaseCard, Empty, ErrorNote, Spinner } from '@/components/ui';
import { gql } from '@/lib/api';
import { CASES, CREATE_CASE } from '@/lib/queries';
import type { CaseSummary } from '@/lib/types';
import { CATEGORY_LABELS, fromDateInput, todayInput } from '@/lib/format';

const TABS = [
  { key: 'ACTIVE', label: 'Active', statuses: ['OPEN', 'SNOOZED'] },
  { key: 'RESOLVED', label: 'Resolved', statuses: ['RESOLVED'] },
  { key: 'CLOSED', label: 'Closed', statuses: ['CLOSED'] },
];

export default function CasesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CasesList />
    </Suspense>
  );
}

function CasesList() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((t) => t.key === params.get('status')) ?? TABS[0];
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useQuery({
    queryKey: ['cases', tab.key, search],
    queryFn: () => gql<{ cases: CaseSummary[] }>(CASES, { filter: { statuses: tab.statuses, search: search || null } }).then((d) => d.cases),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <button className="btn-secondary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : 'Add manually'}</button>
      </div>
      {adding && <ManualCaseForm onCreated={(id) => router.push(`/cases/${id}`)} />}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-stone-200 p-1 dark:border-stone-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => router.replace(`/cases${t.key === 'ACTIVE' ? '' : `?status=${t.key}`}`)}
              className={`rounded-lg px-3 py-1 text-sm ${t.key === tab.key ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 dark:text-stone-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Search title, company, reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data && q.data.length === 0 && <Empty title={search ? 'No matches' : `No ${tab.label.toLowerCase()} cases`} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((c) => <CaseCard key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function ManualCaseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await gql<{ createCase: { id: string } }>(CREATE_CASE, {
        input: {
          title: f.get('title'),
          category: f.get('category'),
          waitingOn: f.get('waitingOn'),
          counterpartyName: f.get('counterpartyName') || null,
          amount: f.get('amount') || null,
          followupAt: fromDateInput(String(f.get('followup') ?? ''), 10),
        },
      });
      onCreated(r.createCase.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="m-title">What are you tracking?</label>
        <input id="m-title" name="title" className="input" required maxLength={200} />
      </div>
      <div>
        <label className="label" htmlFor="m-cat">Category</label>
        <select id="m-cat" name="category" className="input" defaultValue="OTHER">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="m-wait">Who acts next</label>
        <select id="m-wait" name="waitingOn" className="input" defaultValue="OTHER_PARTY">
          <option value="OTHER_PARTY">Waiting on them</option>
          <option value="USER">I need to act</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="m-cp">Company / person</label>
        <input id="m-cp" name="counterpartyName" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="m-amt">Amount</label>
        <input id="m-amt" name="amount" className="input" inputMode="decimal" />
      </div>
      <div>
        <label className="label" htmlFor="m-fu">Follow up on</label>
        <input id="m-fu" name="followup" type="date" min={todayInput()} className="input" />
      </div>
      <div className="flex items-end">
        <button className="btn-primary" disabled={busy}>{busy && <Spinner />} Add case</button>
      </div>
      <div className="sm:col-span-2"><ErrorNote error={error} /></div>
    </form>
  );
}
