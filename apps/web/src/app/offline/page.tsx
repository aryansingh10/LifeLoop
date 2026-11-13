import { Logo } from '@/components/auth-form';

export const metadata = { title: 'Offline · LifeLoop' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo className="h-12 w-12" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-stone-500">LifeLoop needs an internet connection. Your cases are safe — reconnect and try again.</p>
      <a href="/dashboard" className="btn-primary">Try again</a>
    </main>
  );
}
