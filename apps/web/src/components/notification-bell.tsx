'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { gql } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { MARK_READ, NOTIFICATIONS } from '@/lib/queries';
import type { AppNotification } from '@/lib/types';

const KIND_STYLE: Record<string, string> = {
  FOLLOW_UP_DUE: 'bg-brand-500',
  DEADLINE_SOON: 'bg-amber-500',
  OVERDUE: 'bg-red-500',
};

export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => gql<{ unreadNotificationCount: number; notifications: AppNotification[] }>(NOTIFICATIONS),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (ids: string[] | null) => gql(MARK_READ, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // New reminders usually change the dashboard too.
  const unread = q.data?.unreadNotificationCount ?? 0;
  const prev = useRef(unread);
  useEffect(() => {
    if (unread > prev.current) qc.invalidateQueries({ queryKey: ['dashboard'] });
    prev.current = unread;
  }, [unread, qc]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function openItem(n: AppNotification) {
    if (!n.read) markRead.mutate([n.id]);
    setOpen(false);
    if (n.caseId) router.push(`/cases/${n.caseId}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost relative px-2"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4.5 font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
            <span className="text-sm font-semibold">Reminders</span>
            {unread > 0 && (
              <button className="text-xs text-brand-600 hover:underline" onClick={() => markRead.mutate(null)}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {q.data?.notifications.length ? (
              q.data.notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/60 ${n.read ? 'opacity-60' : ''}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : (KIND_STYLE[n.kind] ?? 'bg-stone-400')}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-stone-500">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-stone-400">
                        {timeAgo(n.createdAt)}
                        {n.emailed && ' · emailed'}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-6 text-center text-sm text-stone-500">No reminders yet. They appear here when a follow-up is due.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
