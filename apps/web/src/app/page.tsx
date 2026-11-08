import Link from 'next/link';
import { Logo } from '@/components/auth-form';

const STEPS = [
  { title: 'Share it once', body: 'Type a note, paste an email or WhatsApp message, or drop a screenshot.' },
  { title: 'Check what we found', body: 'LifeLoop pulls out who owes what and by when — and shows you exactly where it read it.' },
  { title: 'Never lose track', body: 'Refunds, repairs, callbacks and documents stay in one place until they are resolved.' },
];

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Logo /> LifeLoop
        </span>
        <div className="flex gap-2">
          <Link href="/login" className="btn-ghost">Log in</Link>
          <Link href="/register" className="btn-primary">Get started</Link>
        </div>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Share it once. <span className="text-brand-600">LifeLoop remembers what happens next.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600 dark:text-stone-300">
          The refund that hasn&apos;t arrived. The technician who never came. The document someone promised to send. Keep every pending commitment in one calm place.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Start tracking — free</Link>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-5">
              <span className="text-sm font-semibold text-brand-600">{i + 1}</span>
              <h2 className="mt-1 font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="py-6 text-center text-xs text-stone-500">Prototype · Nothing is ever tracked without your approval.</footer>
    </main>
  );
}
