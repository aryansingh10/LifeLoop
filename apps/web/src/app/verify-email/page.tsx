'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/auth-form';
import { Spinner } from '@/components/ui';
import { rest } from '@/lib/api';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the link is single-use: never submit twice
    started.current = true;
    const token = params.get('token') ?? '';
    rest('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => {
        setState('ok');
        qc.invalidateQueries({ queryKey: ['me'] });
      })
      .catch((err: Error) => {
        setState('error');
        setMessage(err.message);
      });
  }, [params, qc]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <Logo /> LifeLoop
        </div>
        <div className="card space-y-4 p-6 text-center">
          {state === 'working' && (
            <p className="flex items-center justify-center gap-2 text-stone-500">
              <Spinner /> Verifying your email…
            </p>
          )}
          {state === 'ok' && (
            <>
              <h1 className="text-xl font-semibold">Email verified ✓</h1>
              <p className="text-sm text-stone-500">Thanks! You can now also sign in with Google using this email.</p>
              <Link href="/dashboard" className="btn-primary w-full">Go to LifeLoop</Link>
            </>
          )}
          {state === 'error' && (
            <>
              <h1 className="text-xl font-semibold">Couldn&apos;t verify</h1>
              <p className="text-sm text-stone-500">{message}</p>
              <p className="text-sm text-stone-500">Log in and use “Resend email” to get a new link.</p>
              <Link href="/dashboard" className="btn-secondary w-full">Go to LifeLoop</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
