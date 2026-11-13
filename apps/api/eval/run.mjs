// Runs an evaluation set through the offline extractor + the real validation layer.
//   node eval/run.mjs                          1,000-message set (tuning set), summary table
//   node eval/run.mjs --set=heldout|fresh      hand-written sets
//   node eval/run.mjs --set=large [--n=100000] [--split=dev|test] [--lang=en|hi]
//   node eval/run.mjs --set=blind [--n=1000]   10,000 messages from templates written after tuning
//   --failures[=GROUP] [--field=waitingOn]     every failure (small sets)
//   --patterns [--top=60]                      failures grouped by (category, template, field), biggest first
//   --json=out.json                            machine-readable results
// Uses the compiled code in dist/ (kept fresh by `npm run dev` or `npm run build`).
import { buildDataset } from './dataset.mjs';
import { HELDOUT } from './heldout.mjs';
import { FRESH } from './fresh.mjs';
import { buildLarge } from './large.mjs';
import { buildBlind } from './blind.mjs';
import { mockExtract } from '../dist/modules/ai/mock.provider.js';
import { validateExtraction } from '../dist/modules/extraction/validate.js';
import { normalizeInput } from '../dist/modules/extraction/text.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const NOW = new Date('2026-11-10T06:00:00Z'); // Tue 10 Nov 2026, 11:30 IST
const TZ = 'Asia/Kolkata';
const FIELDS = ['isCommitment', 'category', 'waitingOn', 'counterparty', 'amountMinor', 'deadlineKind'];

function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function actual(p) {
  return {
    isCommitment: p.isCommitment,
    category: p.category,
    waitingOn: p.waitingOn,
    counterparty: p.counterparty?.name ?? null,
    amountMinor: p.amount?.amountMinor ?? null,
    deadlineKind: p.deadline?.kind ?? null,
  };
}

function matches(field, expected, got) {
  if (expected === undefined) return null; // not checked
  if (expected === null) return got === null || got === undefined;
  if (field === 'category' && Array.isArray(expected)) return expected.includes(got);
  if (field === 'counterparty') return got != null && normalize(got).includes(normalize(expected));
  return got === expected;
}

let data =
  args.set === 'heldout'
    ? HELDOUT
    : args.set === 'fresh'
      ? FRESH
      : args.set === 'large'
        ? buildLarge(Number(args.n ?? 100000))
        : args.set === 'blind'
          ? buildBlind(Number(args.n ?? 1000))
          : buildDataset(Number(args.n ?? 100));
if (args.split) data = data.filter((d) => d.split === args.split);
if (args.lang) data = data.filter((d) => d.lang === args.lang);

const started = Date.now();
const groups = {};
const slices = {}; // split / lang breakdown for the large set
const failures = [];
let tp = 0, fp = 0, fn = 0, tn = 0, invented = 0, nullChecks = 0;
const blank = () => ({ n: 0, ...Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, total: 0 }])) });

for (const item of data) {
  // Same clean-up the app applies to every capture before extraction (whitespace, zero-width characters).
  const source = normalizeInput(item.text);
  const v = validateExtraction(mockExtract(source), { source, capturedAt: NOW, timeZone: TZ, now: NOW });
  const got = actual(v.proposed);
  const buckets = [(groups[item.group] ??= blank())];
  if (item.split) buckets.push((slices[`split:${item.split}`] ??= blank()));
  if (item.lang) buckets.push((slices[`lang:${item.lang}`] ??= blank()));
  for (const b of buckets) b.n++;
  for (const f of FIELDS) {
    const expected = item.expect[f];
    // waitingOn only matters for things that should be tracked
    if (f === 'waitingOn' && item.expect.isCommitment === false) continue;
    const ok = matches(f, expected, got[f]);
    if (ok === null) continue;
    for (const b of buckets) {
      b[f].total++;
      if (ok) b[f].ok++;
    }
    if (!ok) failures.push({ group: item.group, pattern: item.pattern, split: item.split, lang: item.lang, field: f, text: item.text, expected, got: got[f] });
    if (expected === null && ['counterparty', 'amountMinor', 'deadlineKind'].includes(f)) {
      nullChecks++;
      if (!ok) invented++;
    }
  }
  const e = item.expect.isCommitment, a = got.isCommitment;
  if (e && a) tp++;
  else if (!e && a) fp++;
  else if (e && !a) fn++;
  else tn++;
}

const pct = (x) => (x.total ? `${(Math.floor((1000 * x.ok) / x.total) / 10).toFixed(1)}%`.padStart(6) : '     -');
const row = (name, g) =>
  `${name.padEnd(17)} ${String(g.n).padStart(6)}  ${pct(g.isCommitment)}  ${pct(g.category)}   ${pct(g.waitingOn)}      ${pct(g.counterparty)}    ${pct(g.amountMinor)}  ${pct(g.deadlineKind)}`;
console.log(`\nLifeLoop extraction eval: ${data.length.toLocaleString('en-IN')} messages, offline rule-based extractor (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
console.log('category               n  track?  category  who-next  company/person  amount  deadline');
const totals = blank();
for (const [name, g] of Object.entries(groups)) {
  console.log(row(name, g));
  totals.n += g.n;
  for (const f of FIELDS) {
    totals[f].ok += g[f].ok;
    totals[f].total += g[f].total;
  }
}
console.log(row('ALL', totals));
if (Object.keys(slices).length) {
  console.log('');
  for (const [name, g] of Object.entries(slices).sort()) console.log(row(name, g));
}
const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
console.log(`\n"Something to track" precision ${(100 * precision).toFixed(1)}%  recall ${(100 * recall).toFixed(1)}%  false-positive rate ${((100 * fp) / (fp + tn || 1)).toFixed(1)}%`);
console.log(`Invented values (non-empty where the text has none): ${invented} of ${nullChecks} checks (${((100 * invented) / (nullChecks || 1)).toFixed(1)}%)`);
console.log(`Failures: ${failures.length.toLocaleString('en-IN')}`);

if (args.failures) {
  const onlyGroup = typeof args.failures === 'string' ? args.failures : null;
  const shown = failures.filter((f) => (!onlyGroup || f.group === onlyGroup) && (!args.field || f.field === args.field));
  let last = '';
  for (const f of shown.slice(0, Number(args.limit ?? 500))) {
    const key = `${f.group} / ${f.field}`;
    if (key !== last) console.log(`\n=== ${key}`);
    last = key;
    console.log(`  [p${f.pattern}] expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.got)}  <- ${f.text}`);
  }
}
if (args.patterns) {
  // One line per (category, template, field): how often it failed, with up to two examples. Biggest first.
  const agg = new Map();
  for (const f of failures) {
    const key = `${f.group} p${f.pattern}${f.split === 'test' ? '*' : ''} ${f.field}`;
    const a = agg.get(key) ?? { n: 0, ex: [] };
    a.n++;
    if (a.ex.length < 2 && !a.ex.some((x) => JSON.stringify(x.got) === JSON.stringify(f.got))) a.ex.push(f);
    agg.set(key, a);
  }
  const sorted = [...agg].sort((a, b) => b[1].n - a[1].n).slice(0, Number(args.top ?? 60));
  console.log(`\nTop failure clusters (* = held-out test template):`);
  for (const [key, { n, ex }] of sorted) {
    console.log(`${key.padEnd(38)} ${String(n).padStart(5)}x`);
    for (const e of ex) console.log(`      exp ${JSON.stringify(e.expected)} got ${JSON.stringify(e.got)}  <- ${e.text.slice(0, 120)}`);
  }
}
if (args.json) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(args.json, JSON.stringify({ groups, slices, totals, precision, recall, invented, nullChecks, failures: failures.slice(0, 20000) }, null, 2));
}
