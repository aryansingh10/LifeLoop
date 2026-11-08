'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Spinner } from '@/components/ui';
import { gql } from '@/lib/api';
import { SEND_TEST_EMAIL, SETTINGS, UPDATE_SETTINGS } from '@/lib/queries';
import type { Settings } from '@/lib/types';

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
