'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BAND_LABELS, CATEGORY_LABELS, isOverdue, relativeDay } from '@/lib/format';
import type { CaseSummary } from '@/lib/types';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center dark:border-stone-700">
      <p className="font-medium text-stone-700 dark:text-stone-200">{title}</p>
      {children && <div className="mt-1 text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function ConfidenceBadge({ band }: { band: string }) {
  const style =
    band === 'HIGH'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : band === 'MEDIUM'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  return <span className={`chip ${style}`}>{BAND_LABELS[band] ?? band}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    OPEN: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    SNOOZED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    RESOLVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    CLOSED: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  };
  return <span className={`chip ${style[status] ?? style.CLOSED}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function CategoryChip({ category }: { category: string | null }) {
  if (!category) return null;
  return <span className="chip bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">{CATEGORY_LABELS[category] ?? category}</span>;
}

export function DateChip({ label, iso, estimated }: { label: string; iso: string | null; estimated?: boolean }) {
  if (!iso) return null;
  const overdue = isOverdue(iso);
  return (
    <span
      className={`chip ${overdue ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'}`}
      title={estimated ? 'Estimated from the message, not a stated date' : undefined}
    >
      {label} {relativeDay(iso)}
      {estimated && <span className="opacity-70">(est.)</span>}
    </span>
  );
}

export function CaseCard({ c }: { c: CaseSummary }) {
  return (
    <Link href={`/cases/${c.id}`} className="card block p-4 transition hover:border-brand-500 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.title}</p>
          <p className="mt-0.5 truncate text-sm text-stone-500">
            {[c.counterpartyName, c.statusLabel, c.amountDisplay].filter(Boolean).join(' · ') || 'No details yet'}
          </p>
        </div>
        {c.status !== 'OPEN' && <StatusBadge status={c.status} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <CategoryChip category={c.category} />
        {c.status === 'RESOLVED' ? (
          <DateChip label="Resolved" iso={c.resolvedAt} />
        ) : (
          <>
            <DateChip label="Due" iso={c.deadlineAt} estimated={c.deadlineKind === 'ESTIMATED'} />
            {c.status === 'SNOOZED' ? <DateChip label="Snoozed until" iso={c.snoozedUntil} /> : <DateChip label="Follow up" iso={c.followupAt} />}
          </>
        )}
      </div>
    </Link>
  );
}

export function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
          {title}
          {count !== undefined && <span className="ml-2 text-stone-400">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
