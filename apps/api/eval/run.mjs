// Runs the evaluation set through the offline extractor + the real validation layer.
//   node eval/run.mjs                 summary table
//   node eval/run.mjs --failures      + every failure, grouped by category and field
//   node eval/run.mjs --failures=REFUND --field=waitingOn
// Uses the compiled code in dist/ (kept fresh by `npm run dev` or `npm run build`).
import { buildDataset } from './dataset.mjs';
import { HELDOUT } from './heldout.mjs';
import { FRESH } from './fresh.mjs';
import { mockExtract } from '../dist/modules/ai/mock.provider.js';
import { validateExtraction } from '../dist/modules/extraction/validate.js';

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

const data = args.set === 'heldout' ? HELDOUT : args.set === 'fresh' ? FRESH : buildDataset(Number(args.n ?? 100));
const groups = {};
const failures = [];
let tp = 0, fp = 0, fn = 0, tn = 0, invented = 0, nullChecks = 0;

for (const item of data) {
  const source = item.text.normalize('NFC').trim();
  const v = validateExtraction(mockExtract(source), { source, capturedAt: NOW, timeZone: TZ, now: NOW });
  const got = actual(v.proposed);
  const g = (groups[item.group] ??= { n: 0, ...Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, total: 0 }])) });
  g.n++;
  for (const f of FIELDS) {
    const expected = item.expect[f];
    // waitingOn only matters for things that should be tracked
    if (f === 'waitingOn' && item.expect.isCommitment === false) continue;
    const ok = matches(f, expected, got[f]);
    if (ok === null) continue;
    g[f].total++;
    if (ok) g[f].ok++;
    else failures.push({ group: item.group, pattern: item.pattern, field: f, text: item.text, expected, got: got[f] });
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

const pct = (x) => (x.total ? `${Math.round((100 * x.ok) / x.total)}%`.padStart(5) : '    -');
console.log(`\nLifeLoop extraction eval: ${data.length} messages, offline rule-based extractor\n`);
console.log('category           n   track? category  who-next  company/person  amount  deadline');
let totals = Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, total: 0 }]));
for (const [name, g] of Object.entries(groups)) {
  console.log(
    `${name.padEnd(17)} ${String(g.n).padStart(3)}  ${pct(g.isCommitment)}   ${pct(g.category)}    ${pct(g.waitingOn)}       ${pct(g.counterparty)}      ${pct(g.amountMinor)}   ${pct(g.deadlineKind)}`,
  );
  for (const f of FIELDS) {
    totals[f].ok += g[f].ok;
    totals[f].total += g[f].total;
  }
}
console.log(
  `${'ALL'.padEnd(17)} ${String(data.length).padStart(3)}  ${pct(totals.isCommitment)}   ${pct(totals.category)}    ${pct(totals.waitingOn)}       ${pct(totals.counterparty)}      ${pct(totals.amountMinor)}   ${pct(totals.deadlineKind)}`,
);
const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
console.log(`\n"Something to track" precision ${(100 * precision).toFixed(1)}%  recall ${(100 * recall).toFixed(1)}%  false-positive rate ${((100 * fp) / (fp + tn || 1)).toFixed(1)}%`);
console.log(`Invented values (non-empty where the text has none): ${invented} of ${nullChecks} checks (${((100 * invented) / (nullChecks || 1)).toFixed(1)}%)`);
console.log(`Failures: ${failures.length}`);

if (args.failures) {
  const onlyGroup = typeof args.failures === 'string' ? args.failures : null;
  const shown = failures.filter((f) => (!onlyGroup || f.group === onlyGroup) && (!args.field || f.field === args.field));
  let last = '';
  for (const f of shown) {
    const key = `${f.group} / ${f.field}`;
    if (key !== last) console.log(`\n=== ${key}`);
    last = key;
    console.log(`  [p${f.pattern}] expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.got)}  <- ${f.text}`);
  }
}
if (args.patterns) {
  // One line per (category, sentence pattern, field): how often it failed, with one example.
  const agg = new Map();
  for (const f of failures) {
    const key = `${f.group} p${f.pattern} ${f.field}`;
    const a = agg.get(key) ?? { n: 0, ex: f };
    a.n++;
    agg.set(key, a);
  }
  for (const [key, { n, ex }] of [...agg].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    console.log(`${key.padEnd(36)} ${String(n).padStart(3)}x  exp ${JSON.stringify(ex.expected)} got ${JSON.stringify(ex.got)}  <- ${ex.text.slice(0, 110)}`);
  }
}
if (args.json) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(args.json, JSON.stringify({ groups, totals, precision, recall, invented, nullChecks, failures }, null, 2));
}
