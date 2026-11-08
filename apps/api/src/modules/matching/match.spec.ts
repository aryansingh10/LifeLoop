import { mockExtract } from '../ai/mock.provider.js';
import { normalizeInput } from '../extraction/text.js';
import { validateExtraction } from '../extraction/validate.js';
import { matchCases, type CandidateCase } from './match.js';

const NOW = new Date('2026-11-07T10:00:00Z');
const proposal = (text: string) => {
  const source = normalizeInput(text);
  return validateExtraction(mockExtract(source), { source, capturedAt: NOW, timeZone: 'Asia/Kolkata' }).proposed;
};
const baseCase = (over: Partial<CandidateCase>): CandidateCase => ({
  id: 'c1',
  title: 'Amazon refund ₹2,499',
  category: 'REFUND',
  status: 'OPEN',
  counterpartyNormalized: 'amazon',
  amountMinor: 249_900,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  identifiers: [],
  ...over,
});

describe('matching', () => {
  it('same order id is a strong match and becomes the target', () => {
    const p = proposal('Refund for order 403-1234567 of Rs. 2,499 has been processed by Amazon.');
    const r = matchCases(p, [baseCase({ identifiers: [{ kind: 'ORDER_ID', valueNormalized: '4031234567' }] })], NOW);
    expect(r.candidates[0].strength).toBe('STRONG');
    expect(r.targetCaseId).toBe('c1');
  });

  it('same merchant + amount without ids is a medium match', () => {
    const p = proposal('Amazon refund of ₹2,499 has been credited.');
    const r = matchCases(p, [baseCase({})], NOW);
    expect(r.candidates[0].strength).toBe('MEDIUM');
    expect(r.targetCaseId).toBe('c1');
  });

  it('two equally plausible cases are ambiguous: no target, user chooses', () => {
    const p = proposal('Your Swiggy refund of ₹499 is processed.');
    const swiggy = { title: 'Swiggy refund ₹499', counterpartyNormalized: 'swiggy', amountMinor: 49_900 };
    const r = matchCases(p, [baseCase({ id: 'a', ...swiggy }), baseCase({ id: 'b', ...swiggy })], NOW);
    expect(r.targetCaseId).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toHaveLength(2);
  });

  it('a conflicting order id rules the case out even with same merchant and amount', () => {
    const p = proposal('Swiggy refund of ₹499 for order 7788990011 processed.');
    const r = matchCases(
      p,
      [baseCase({ counterpartyNormalized: 'swiggy', amountMinor: 49_900, identifiers: [{ kind: 'ORDER_ID', valueNormalized: '1122334455' }] })],
      NOW,
    );
    expect(r.candidates).toHaveLength(0);
    expect(r.targetCaseId).toBeNull();
  });

  it('unrelated cases do not match', () => {
    const p = proposal('Dell service center will call within 3 days about my laptop repair.');
    expect(matchCases(p, [baseCase({})], NOW).candidates).toHaveLength(0);
  });
});
