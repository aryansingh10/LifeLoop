'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Logo } from '@/components/auth-form';
import { ErrorNote, Spinner } from '@/components/ui';
import { rest } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <Reset />
    </Suspense>
  );
}

function Reset() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    if (password !== String(f.get('confirm') ?? '')) {
      setError(new Error("The two passwords don't match"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      qc.clear();
      router.replace('/dashboard');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <Logo /> LifeLoop
        </Link>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          {!token ? (
            <p className="text-sm text-stone-500">
              This link is incomplete. <Link className="font-medium text-brand-600" href="/forgot-password">Request a new one</Link>.
            </p>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="password">New password</label>
                <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required />
                <p className="mt-1 text-xs text-stone-500">At least 10 characters.</p>
              </div>
              <div>
                <label className="label" htmlFor="confirm">Repeat password</label>
                <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={10} required />
              </div>
              <p className="text-xs text-stone-500">For your safety, every other device signed in to your account will be signed out.</p>
              <ErrorNote error={error} />
              <button className="btn-primary w-full" disabled={busy}>
                {busy && <Spinner />} Save password
              </button>
              {error != null && (
                <Link href="/forgot-password" className="block text-center text-sm text-brand-600 hover:underline">Request a new link</Link>
              )}
            </>
          )}
        </form>
      </div>
    </main>
  );
}
