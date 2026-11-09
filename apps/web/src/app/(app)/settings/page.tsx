'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { GoogleButton } from '@/components/auth-form';
import { ErrorNote, Spinner } from '@/components/ui';
import { gql, rest } from '@/lib/api';
import { DISCONNECT_GOOGLE, SEND_TEST_EMAIL, SETTINGS, UPDATE_SETTINGS } from '@/lib/queries';
import type { Settings } from '@/lib/types';

const GOOGLE_RESULTS: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: 'Google is connected. You can now sign in with Google or your password.' },
  google_used_by_other: { ok: false, text: 'That Google account is already connected to a different LifeLoop account.' },
  email_belongs_to_other: { ok: false, text: "That Google account's email belongs to a different LifeLoop account." },
  not_logged_in: { ok: false, text: 'Your session expired. Log in and try again.' },
  google_cancelled: { ok: false, text: 'Connecting Google was cancelled.' },
  google_expired: { ok: false, text: 'That took too long. Please try again.' },
  google_failed: { ok: false, text: "Connecting Google didn't work. Please try again." },
  google_unverified: { ok: false, text: 'That Google email address is not verified.' },
};

function GoogleSection({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const params = useSearchParams();
  const result = GOOGLE_RESULTS[params.get('google') ?? ''];
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => rest<{ google: boolean }>('/api/auth/providers'), staleTime: Infinity });
  const disconnect = useMutation({
    mutationFn: () => gql(DISCONNECT_GOOGLE),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const addPassword = useMutation({
    mutationFn: () => rest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: s.email }) }),
  });

  if (!providers.data?.google && !s.googleEmail && s.hasPassword) return null;
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Sign-in</h2>
        <p className="text-sm text-stone-500">LifeLoop only receives your name and email from Google — never your Gmail.</p>
      </div>
      {result && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}
        >
          {result.text}
        </p>
      )}
      {s.googleEmail ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Google connected: <strong>{s.googleEmail}</strong>
          </p>
          {s.hasPassword ? (
            <button className="btn-ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Disconnect
            </button>
          ) : (
            <span className="text-xs text-stone-500">Your only sign-in method</span>
          )}
        </div>
      ) : (
        <GoogleButton href="/api/auth/google/start?mode=link" label="Connect Google" />
      )}
      {!s.hasPassword && (
        <div className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-700">
          <p className="text-stone-600 dark:text-stone-300">
            Want to also sign in with email and password? We&apos;ll email <strong>{s.email}</strong> a link to set one.
          </p>
          {addPassword.isSuccess ? (
            <p className="mt-2 font-medium text-emerald-700 dark:text-emerald-300">Link sent. Check your inbox (it expires in 30 minutes).</p>
          ) : (
            <button className="btn-secondary mt-2" disabled={addPassword.isPending} onClick={() => addPassword.mutate()}>
              {addPassword.isPending && <Spinner />} Add a password
            </button>
          )}
        </div>
      )}
      <ErrorNote error={disconnect.error ?? addPassword.error} />
    </section>
  );
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true });

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => gql<{ me: Settings }>(SETTINGS).then((d) => d.me) });
  const update = useMutation({
    mutationFn: (input: Partial<Pick<Settings, 'emailNotifications' | 'digestEnabled' | 'digestHour'>>) => gql(UPDATE_SETTINGS, { input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const test = useMutation({ mutationFn: () => gql<{ sendTestEmail: string }>(SEND_TEST_EMAIL).then((d) => d.sendTestEmail) });

  if (q.isPending) return <Spinner className="h-6 w-6" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = q.data;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Suspense fallback={null}>
        <GoogleSection s={s} />
      </Suspense>

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="font-semibold">Reminders</h2>
          <p className="text-sm text-stone-500">
            You always get in-app reminders (the bell at the top) when a follow-up is due, a deadline is tomorrow, or something is overdue.
          </p>
        </div>

        <Toggle
          label="Email me reminders"
          hint={`Sent to ${s.email}`}
          checked={s.emailNotifications}
          disabled={update.isPending}
          onChange={(v) => update.mutate({ emailNotifications: v })}
        />
        <Toggle
          label="Morning digest"
          hint="One email a day with what's due, only when something needs attention"
          checked={s.digestEnabled}
          disabled={update.isPending || !s.emailNotifications}
          onChange={(v) => update.mutate({ digestEnabled: v })}
        />
        {s.digestEnabled && s.emailNotifications && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Digest time ({s.timezone})</span>
            <select className="input w-32" value={s.digestHour} onChange={(e) => update.mutate({ digestHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        )}
        <ErrorNote error={update.error} />

        <div className="border-t border-stone-200 pt-4 dark:border-stone-800">
          <button className="btn-secondary" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending && <Spinner />} Send me a test email
          </button>
          {test.data && <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">{test.data}</p>}
          <ErrorNote error={test.error} />
          {s.emailDelivery === 'console' && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              Email is in <strong>console mode</strong>: emails are printed in the API terminal and saved in apps/api/storage/outbox instead of being sent. Add SMTP settings to
              apps/api/.env to receive them in your inbox.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-stone-300 dark:bg-stone-700'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
