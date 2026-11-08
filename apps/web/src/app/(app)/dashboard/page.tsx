'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CaptureBox } from '@/components/capture-box';
import { CaseCard, Empty, ErrorNote, Section, Spinner } from '@/components/ui';
import { gql } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { CAPTURES, DASHBOARD } from '@/lib/queries';
import type { Capture, Dashboard } from '@/lib/types';

type CaptureListItem = Capture & { suggestion: { id: string; kind: string; status: string; confidenceBand: string; proposed: { title: string } } | null };

const CAPTURE_STATUS: Record<string, string> = {
  PREPROCESSING: 'Reading image…',
  EXTRACTING: 'Processing…',
  NEEDS_REVIEW: 'Ready to review',
  NO_COMMITMENT: 'Nothing to track',
  DUPLICATE: 'Already shared',
  FAILED: 'Failed',
};

export default function DashboardPage() {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => gql<{ dashboard: Dashboard }>(DASHBOARD).then((d) => d.dashboard) });
  const captures = useQuery({
    queryKey: ['captures'],
    queryFn: () => gql<{ captures: CaptureListItem[] }>(CAPTURES).then((d) => d.captures),
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === 'EXTRACTING' || c.status === 'PREPROCESSING') ? 2000 : false),
  });
  const d = dash.data;

  return (
    <div className="space-y-8">
      <CaptureBox />

      {dash.isPending && <Spinner />}
      <ErrorNote error={dash.error} />

      {d && (
        <>
          {d.pendingSuggestions > 0 && (
            <Link href="/suggestions" className="card flex items-center justify-between border-brand-500 bg-brand-50 p-4 dark:bg-brand-700/10">
              <span className="font-medium">
                {d.pendingSuggestions} suggestion{d.pendingSuggestions > 1 ? 's' : ''} waiting for your review
              </span>
              <span className="text-sm font-medium text-brand-700 dark:text-brand-100">Review →</span>
            </Link>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Open" value={d.openCases} />
            <Stat label="Follow up soon" value={d.followUpDue.length} />
            <Stat label="Resolved" value={d.resolvedCases} />
          </div>

          <Section title="Follow up today" count={d.followUpDue.length}>
            {d.followUpDue.length ? <Grid>{d.followUpDue.map((c) => <CaseCard key={c.id} c={c} />)}</Grid> : <Empty title="Nothing due right now" />}
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Needs your action" count={d.needsAction.length}>
              {d.needsAction.length ? <div className="space-y-3">{d.needsAction.map((c) => <CaseCard key={c.id} c={c} />)}</div> : <Empty title="You're all caught up" />}
            </Section>
            <Section title="Waiting on others" count={d.waitingOnOthers.length}>
              {d.waitingOnOthers.length ? (
                <div className="space-y-3">{d.waitingOnOthers.map((c) => <CaseCard key={c.id} c={c} />)}</div>
              ) : (
                <Empty title="No one owes you anything">Capture a refund, repair or promise to start tracking it.</Empty>
              )}
            </Section>
          </div>

          {d.recentlyResolved.length > 0 && (
            <Section title="Recently resolved" action={<Link href="/cases?status=RESOLVED" className="text-sm text-brand-600">See all</Link>}>
              <Grid>{d.recentlyResolved.map((c) => <CaseCard key={c.id} c={c} />)}</Grid>
            </Section>
          )}
        </>
      )}

      {captures.data && captures.data.length > 0 && (
        <Section title="Recent captures">
          <ul className="card divide-y divide-stone-200 dark:divide-stone-800">
            {captures.data.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link href={`/captures/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {c.suggestion?.proposed.title ?? c.rawText ?? c.note ?? (c.source === 'SCREENSHOT' ? 'Screenshot' : 'Capture')}
                    </span>
                    <span className="text-xs text-stone-500">{c.source === 'SCREENSHOT' ? 'Screenshot' : c.source === 'PASTE' ? 'Pasted' : 'Typed'} · {timeAgo(c.createdAt)}</span>
                  </span>
                  <span className={`chip shrink-0 ${c.status === 'NEEDS_REVIEW' && c.suggestion?.status === 'PENDING' ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100' : c.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}`}>
                    {(c.status === 'EXTRACTING' || c.status === 'PREPROCESSING') && <Spinner className="h-3 w-3" />}
                    {c.suggestion && c.suggestion.status !== 'PENDING' ? c.suggestion.status.charAt(0) + c.suggestion.status.slice(1).toLowerCase() : CAPTURE_STATUS[c.status] ?? c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-2 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
