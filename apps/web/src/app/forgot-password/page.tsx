'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Logo } from '@/components/auth-form';
import { ErrorNote, Spinner } from '@/components/ui';
import { rest } from '@/lib/api';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <Forgot />
    </Suspense>
  );
}

function Forgot() {
  const params = useSearchParams();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    setBusy(true);
    setError(null);
    try {
      await rest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(email);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <Logo /> LifeLoop
        </Link>
        <div className="card space-y-4 p-6">
          {sent ? (
            <>
              <h1 className="text-xl font-semibold">Check your email</h1>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                If <strong>{sent}</strong> has a LifeLoop account, we&apos;ve sent a link to set a new password. It works once and expires in 30 minutes.
              </p>
              <p className="text-xs text-stone-500">Nothing arrived? Check spam, or wait a minute and try again.</p>
              <Link href="/login" className="btn-secondary w-full">Back to log in</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="text-xl font-semibold">Forgot your password?</h1>
              <p className="text-sm text-stone-500">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" className="input" autoComplete="email" required defaultValue={params.get('email') ?? ''} />
              </div>
              <ErrorNote error={error} />
              <button className="btn-primary w-full" disabled={busy}>
                {busy && <Spinner />} Send link
              </button>
              <Link href="/login" className="block text-center text-sm text-stone-500 hover:underline">Back to log in</Link>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
