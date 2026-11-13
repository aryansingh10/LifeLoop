'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { CaptureBox, type CaptureInitial } from '@/components/capture-box';
import { Spinner } from '@/components/ui';
import { isAudioFile, isImageFile, takeSharedContent } from '@/lib/pwa';

const SHARE_ERRORS: Record<string, string> = {
  'too-large': 'That file is too large to share into LifeLoop.',
  read: "LifeLoop couldn't read what you shared. Please try again.",
};

/** Opened by the phone's share sheet (via the service worker): shows what was shared, ready to track. */
export default function SharePage() {
  return (
    <Suspense fallback={<Spinner className="h-6 w-6" />}>
      <ShareInner />
    </Suspense>
  );
}

function ShareInner() {
  const params = useSearchParams();
  const shareError = SHARE_ERRORS[params.get('error') ?? ''];
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; initial: CaptureInitial; note?: string } | { status: 'empty' }>({ status: 'loading' });
  const taken = useRef(false);

  useEffect(() => {
    if (taken.current) return; // shared content is read once, then deleted from the device
    taken.current = true;
    takeSharedContent()
      .then((shared) => {
        if (!shared || (!shared.text && !shared.file)) return setState({ status: 'empty' });
        const f = shared.file;
        if (f && isImageFile(f)) return setState({ status: 'ready', initial: { text: shared.text, image: f } });
        if (f && isAudioFile(f)) return setState({ status: 'ready', initial: { text: shared.text, audio: f } });
        const note = f ? 'LifeLoop can read screenshots (PNG, JPEG, WebP) and voice notes. That file type was skipped.' : undefined;
        if (!shared.text) return setState({ status: 'empty' });
        setState({ status: 'ready', initial: { text: shared.text }, note });
      })
      .catch(() => setState({ status: 'empty' }));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Track what you shared</h1>
      {shareError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{shareError}</p>}
      {state.status === 'loading' && <Spinner className="h-6 w-6" />}
      {state.status === 'ready' && (
        <>
          {state.note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{state.note}</p>}
          <p className="text-sm text-stone-500">Check it, add a note if you like, then tap Track it.</p>
          <CaptureBox compact initial={state.initial} />
        </>
      )}
      {state.status === 'empty' && (
        <div className="card space-y-3 p-5 text-sm">
          {!shareError && <p>Nothing is waiting here. Share a screenshot, voice note or message to LifeLoop from any app, or capture it directly.</p>}
          <Link href="/dashboard" className="btn-primary">Go to Home</Link>
        </div>
      )}
    </div>
  );
}
