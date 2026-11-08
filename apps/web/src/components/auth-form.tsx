'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { rest } from '@/lib/api';
import { ErrorNote, Spinner } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'register'
          ? {
              displayName: form.get('displayName'),
              email: form.get('email'),
              password: form.get('password'),
              ageConfirmed: form.get('ageConfirmed') === 'on',
            }
          : { email: form.get('email'), password: form.get('password') };
      await rest(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
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
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <h1 className="text-xl font-semibold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="displayName">Name</label>
              <input id="displayName" name="displayName" className="input" autoComplete="name" required maxLength={100} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 10 : undefined}
              required
            />
            {mode === 'register' && <p className="mt-1 text-xs text-stone-500">At least 10 characters.</p>}
          </div>
          {mode === 'register' && (
            <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
              <input type="checkbox" name="ageConfirmed" required className="mt-0.5" />
              <span>
                I am 18 or older and I understand that what I capture is processed by an AI service to extract details.
              </span>
            </label>
          )}
          <ErrorNote error={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner />} {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <p className="text-center text-sm text-stone-500">
            {mode === 'login' ? (
              <>New here? <Link className="font-medium text-brand-600" href="/register">Create an account</Link></>
            ) : (
              <>Already have an account? <Link className="font-medium text-brand-600" href="/login">Log in</Link></>
            )}
          </p>
        </form>
      </div>
    </main>
  );
}

export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <path d="M10 16a6 6 0 1 0 6-6" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M16 6.5 19 10l-3.5 3" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
