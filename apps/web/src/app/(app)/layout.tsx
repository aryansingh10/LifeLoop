'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/auth-form';
import { NotificationBell } from '@/components/notification-bell';
import { Spinner } from '@/components/ui';
import { ApiError, gql, rest } from '@/lib/api';
import { DASHBOARD, ME } from '@/lib/queries';
import type { Dashboard, User } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/suggestions', label: 'Review' },
  { href: '/cases', label: 'Cases' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => gql<{ me: User }>(ME).then((d) => d.me) });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => gql<{ dashboard: Dashboard }>(DASHBOARD).then((d) => d.dashboard), enabled: me.isSuccess });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.isAuth) router.replace('/login');
  }, [me.error, router]);

  async function logout() {
    await rest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    router.replace('/login');
  }

  if (me.isPending || (me.error instanceof ApiError && me.error.isAuth)) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-stone-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (me.error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-medium">{(me.error as Error).message}</p>
        <button className="btn-secondary" onClick={() => me.refetch()}>Try again</button>
      </div>
    );
  }

  const pending = dash.data?.pendingSuggestions ?? 0;
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Logo className="h-6 w-6" /> LifeLoop
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} active={pathname.startsWith(n.href)} badge={n.href === '/suggestions' ? pending : 0}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-stone-500 md:inline">{me.data.displayName}</span>
            <NotificationBell />
            <Link href="/settings" className="btn-ghost px-2" aria-label="Settings">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </Link>
            <button className="btn-ghost px-2" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      {me.data.emailVerified === false && <VerifyEmailBanner email={me.data.email} />}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-stone-200 bg-white py-2 sm:hidden dark:border-stone-800 dark:bg-stone-900">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} active={pathname.startsWith(n.href)} badge={n.href === '/suggestions' ? pending : 0}>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function resend() {
    setState('sending');
    try {
      await rest('/api/auth/resend-verification', { method: 'POST' });
      setState('sent');
    } catch (err) {
      setMessage((err as Error).message);
      setState('error');
    }
  }
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
        <span>
          Please verify your email: we sent a link to <strong>{email}</strong>.
          {state === 'sent' && ' A new link is on its way.'}
          {state === 'error' && ` ${message}`}
        </span>
        {state !== 'sent' && (
          <button className="font-medium underline-offset-2 hover:underline" disabled={state === 'sending'} onClick={resend}>
            {state === 'sending' ? 'Sending…' : 'Resend email'}
          </button>
        )}
      </div>
    </div>
  );
}

function NavLink({ href, active, badge, children }: { href: string; active: boolean; badge: number; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative rounded-xl px-3 py-1.5 text-sm font-medium ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'}`}
    >
      {children}
      {badge > 0 && <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>}
    </Link>
  );
}
