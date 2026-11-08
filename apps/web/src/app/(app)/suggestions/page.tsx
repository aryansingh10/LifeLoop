'use client';

import { useQuery } from '@tanstack/react-query';
import { SuggestionReview } from '@/components/suggestion-review';
import { Empty, ErrorNote, Section, Spinner } from '@/components/ui';
import { gql } from '@/lib/api';
import { SUGGESTIONS } from '@/lib/queries';
import type { Capture, Suggestion } from '@/lib/types';

type Item = Suggestion & { capture: Capture };

export default function SuggestionsPage() {
  const q = useQuery({ queryKey: ['suggestions'], queryFn: () => gql<{ suggestions: Item[] }>(SUGGESTIONS).then((d) => d.suggestions) });
  if (q.isPending) return <Spinner className="h-6 w-6" />;
  if (q.error) return <ErrorNote error={q.error} />;

  const main = q.data.filter((s) => s.confidenceBand !== 'LOW');
  const low = q.data.filter((s) => s.confidenceBand === 'LOW');
  const text = (s: Item) => s.capture.editedText ?? s.capture.extractedText ?? '';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Review</h1>
        <p className="text-sm text-stone-500">Nothing is tracked until you approve it.</p>
      </div>
      {q.data.length === 0 && <Empty title="Nothing to review">New suggestions appear here after you capture something.</Empty>}
      {main.length > 0 && (
        <div className="space-y-6">
          {main.map((s) => (
            <SuggestionReview key={s.id} suggestion={s} sourceText={text(s)} />
          ))}
        </div>
      )}
      {low.length > 0 && (
        <Section title="Low confidence" count={low.length}>
          <p className="text-sm text-stone-500">LifeLoop isn&apos;t sure these need tracking. Check them when you have a moment.</p>
          <div className="space-y-6">
            {low.map((s) => (
              <SuggestionReview key={s.id} suggestion={s} sourceText={text(s)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
