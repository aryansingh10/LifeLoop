'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { rest } from '@/lib/api';
import { ErrorNote, Spinner } from './ui';

/** Messages for ?error= codes returned by the Google sign-in callback. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_expired: 'The Google sign-in took too long. Please try again.',
  google_failed: "Google sign-in didn't work. Please try again.",
  google_unverified: 'Your Google email address is not verified, so it cannot be used to sign in.',
  google_not_configured: 'Google sign-in is not set up on this server yet.',
  account_conflict: 'This email is already used by another sign-in method. Log in with your password.',
};

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  return (
    <Suspense fallback={null}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}

function AuthFormInner({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => rest<{ google: boolean }>('/api/auth/providers'),
    staleTime: Infinity,
  });

  const linkingGoogle = mode === 'login' && params.get('link') === 'google';
  const prefillEmail = params.get('email') ?? '';
  const googleError = GOOGLE_ERRORS[params.get('error') ?? ''];
  const needsAge = mode === 'register' && params.get('google') === 'age';

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
      const r = await rest<{ linkedGoogle?: boolean }>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      router.replace(r.linkedGoogle ? '/settings?google=linked' : '/dashboard');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  // New Google users confirm 18+ on one screen right after Google, so the button is always available.
  const googleHref = '/api/auth/google/start';
  const [claiming, setClaiming] = useState(false);
  async function claimWithGoogle() {
    const ok = window.confirm(
      'Use Google only for this account?\n\nThe current password will be removed and any other device signed in to this account will be signed out. From now on you sign in with Google.',
    );
    if (!ok) return;
    setClaiming(true);
    setError(null);
    try {
      await rest('/api/auth/google/claim', { method: 'POST' });
      router.replace('/dashboard');
    } catch (err) {
      setError(err);
      setClaiming(false);
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

          {linkingGoogle && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-700/15 dark:text-brand-100">
              You already have a LifeLoop account with <strong>{prefillEmail}</strong>. Enter your password once to connect Google — after that you can sign in
              with either.
            </p>
          )}
          {needsAge && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              Almost there. Please confirm you are 18 or older below, then continue with Google again.
            </p>
          )}
          {googleError && <ErrorNote error={new Error(googleError)} />}

          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="displayName">Name</label>
              <input id="displayName" name="displayName" className="input" autoComplete="name" required maxLength={100} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" defaultValue={prefillEmail} required />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="label" htmlFor="password">Password</label>
              {mode === 'login' && (
                <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
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
              <input type="checkbox" name="ageConfirmed" required className="mt-0.5" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />
              <span>I am 18 or older and I understand that what I capture is processed by an AI service to extract details.</span>
            </label>
          )}
          <ErrorNote error={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy || claiming}>
            {busy && <Spinner />} {linkingGoogle ? 'Log in & connect Google' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {linkingGoogle && (
            <div className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-700">
              <p className="text-stone-600 dark:text-stone-300">
                Don&apos;t know this password, or didn&apos;t create this account? Google has confirmed this email is yours.
              </p>
              <button type="button" className="btn-secondary mt-2 w-full" disabled={busy || claiming} onClick={claimWithGoogle}>
                {claiming && <Spinner />} Use Google only for this account
              </button>
            </div>
          )}

          {providers.data?.google && !linkingGoogle && (
            <>
              <div className="flex items-center gap-3 text-xs text-stone-400">
                <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" /> or <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
              </div>
              <GoogleButton href={googleHref} />
              {mode === 'login' && (
                <p className="-mt-1 text-center text-xs text-stone-500">
                  Signed up with Google? Use Continue with Google.
                </p>
              )}
            </>
          )}

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

export function GoogleButton({ href, disabled, label = 'Continue with Google' }: { href: string; disabled?: boolean; label?: string }) {
  const content = (
    <>
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {label}
    </>
  );
  if (disabled) {
    return (
      <span aria-disabled className="btn-secondary w-full cursor-not-allowed opacity-50">
        {content}
      </span>
    );
  }
  // Full-page navigation: the OAuth flow must leave the app and come back.
  return (
    <a href={href} className="btn-secondary w-full">
      {content}
    </a>
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
