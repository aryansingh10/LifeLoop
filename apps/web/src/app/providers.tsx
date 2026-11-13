'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { registerServiceWorker } from '@/lib/pwa';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiError && (err.isAuth || err.code === 'NOT_FOUND')) && count < 2,
          },
        },
      }),
  );
  // Installable app: share target, phone notifications and the offline page all run through the service worker.
  useEffect(registerServiceWorker, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
