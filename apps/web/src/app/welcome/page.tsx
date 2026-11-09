'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/auth-form';
import { ErrorNote, Spinner } from '@/components/ui';
import { rest } from '@/lib/api';

/** One-step finish for new Google users: confirm 18+ (Google doesn't share age), then the account is created. */
export default function WelcomePage() {
  const router = useRouter();
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useQuery({
    queryKey: ['pending-signup'],
    queryFn: () => rest<{ name: string | null; email: string }>('/api/auth/google/pending-signup'),
    retry: false,
  });

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await rest('/api/auth/google/complete-signup', { method: 'POST', body: JSON.stringify({ ageConfirmed: true }) });
      router.replace('/dashboard');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <Logo /> LifeLoop
        </div>
        <div className="card space-y-4 p-6">
          {pending.isPending ? (
            <Spinner />
          ) : pending.error ? (
            <>
              <h1 className="text-xl font-semibold">This link has expired</h1>
              <p className="text-sm text-stone-500">Please continue with Google again.</p>
              <Link href="/login" className="btn-primary w-full">Back to log in</Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Welcome{pending.data.name ? `, ${pending.data.name.split(' ')[0]}` : ''}!</h1>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                You&apos;re creating a LifeLoop account with <strong>{pending.data.email}</strong>. One last step:
              </p>
              <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
                <input type="checkbox" className="mt-0.5" checked={age} onChange={(e) => setAge(e.target.checked)} />
                <span>I am 18 or older and I understand that what I capture is processed by an AI service to extract details.</span>
              </label>
              <ErrorNote error={error} />
              <button className="btn-primary w-full" disabled={!age || busy} onClick={finish}>
                {busy && <Spinner />} Create my account
              </button>
              <Link href="/login" className="block text-center text-sm text-stone-500 hover:underline">Cancel</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
