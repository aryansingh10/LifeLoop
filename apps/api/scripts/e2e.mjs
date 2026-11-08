// End-to-end check of a running LifeLoop API using the mock AI provider.
// Usage (API running, preferably on an empty database): npm run e2e -w apps/api [-- http://localhost:4000]
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const BASE = process.argv[2] ?? 'http://localhost:4000';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

function client() {
  let cookie = '';
  const call = async (path, init = {}) => {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const gql = async (query, variables) => {
    const res = await call('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  };
  return { call, gql };
}

const SUG = `id kind status confidenceBand targetCaseId proposed { title classification category statusLabel waitingOn amount { display } deadline { kind expression } counterparty { value } identifiers { value } suggestedFollowupAt uncertainties } candidates { strength reasons case { id title } }`;

async function capture(c, text) {
  const r = await c.gql(
    `mutation($i: CreateTextCaptureInput!){ createTextCapture(input:$i){ id status } }`,
    { i: { text, source: 'TEXT', clientRequestId: randomUUID() } },
  );
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return waitFor(c, r.data.createTextCapture.id);
}

async function waitFor(c, id) {
  for (let i = 0; i < 90; i++) {
    const r = await c.gql(
      `query($id: ID!){ capture(id:$id){ id status failureCode extractedText ocrConfidence suggestion { ${SUG} } } }`,
      { id },
    );
    const cap = r.data?.capture;
    if (
      cap &&
      !['RECEIVED', 'PREPROCESSING', 'EXTRACTING'].includes(cap.status)
    )
      return cap;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('capture did not finish processing');
}

const register = async (c, email) => {
  const res = await c.call('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'correct horse battery',
      displayName: 'Test',
      ageConfirmed: true,
    }),
  });
  return res.status;
};

const a = client();
const email = `a-${Date.now()}@example.com`;

// --- auth
check(
  (await a.gql('{ me { id } }')).errors?.[0]?.extensions?.code ===
    'UNAUTHENTICATED',
  'GraphQL denies anonymous access',
);
check((await register(a, email)) === 201, 'register sets a session');
check(
  (await a.gql('{ me { email } }')).data?.me?.email === email,
  'me returns the logged-in user',
);
const bad = await client().call('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'wrong password!!' }),
});
check(bad.status === 401, 'wrong password is rejected');

// --- J1: new refund case
const c1 = await capture(
  a,
  "Amazon initiated my refund of ₹2,499 yesterday, but I haven't received the money yet.",
);
const s1 = c1.suggestion;
check(
  c1.status === 'NEEDS_REVIEW' && s1?.kind === 'NEW_CASE',
  `J1 suggestion is NEW_CASE (${s1?.kind}, ${s1?.confidenceBand})`,
);
check(
  s1?.proposed.amount?.display === '₹2,499' &&
    s1?.proposed.counterparty?.value === 'Amazon',
  'J1 amount and counterparty extracted with evidence',
);
check(s1?.proposed.deadline === null, 'J1 no deadline invented');
const casesBefore = (await a.gql('{ cases { id } }')).data.cases.length;
check(casesBefore === 0, 'no case exists before approval');
const ap = await a.gql(
  `mutation($id: ID!){ approveSuggestion(id:$id){ case { id title status followupAt } } }`,
  { id: s1.id },
);
const case1 = ap.data?.approveSuggestion?.case;
check(
  case1?.status === 'OPEN' && case1?.followupAt,
  `approving creates an open case with a follow-up (${case1?.title})`,
);
const again = await a.gql(
  `mutation($id: ID!){ approveSuggestion(id:$id){ case { id } } }`,
  { id: s1.id },
);
check(
  again.errors?.[0]?.extensions?.code === 'CONFLICT',
  'approving twice is rejected (idempotent)',
);

// --- J2: update matched to the existing case, resolves it
const c2 = await capture(
  a,
  'Your Amazon refund of Rs. 2,499 has been successfully processed and credited to your account.',
);
const s2 = c2.suggestion;
check(
  s2?.kind === 'UPDATE_CASE' && s2?.targetCaseId === case1.id,
  `J2 matched to the existing case (${s2?.kind}, ${s2?.candidates?.[0]?.reasons?.join(', ')})`,
);
await a.gql(
  `mutation($id: ID!){ approveSuggestion(id:$id, resolveCase:true){ case { id } } }`,
  { id: s2.id },
);
const detail = (
  await a.gql(
    `query($id: ID!){ case(id:$id){ status statusLabel events { type summary } captures { id } } }`,
    { id: case1.id },
  )
).data.case;
check(
  detail.status === 'RESOLVED' && detail.statusLabel === 'Refund completed',
  'J2 case resolved with updated status label',
);
check(
  detail.captures.length === 2 &&
    detail.events.some((e) => e.type === 'CAPTURE_ATTACHED'),
  'timeline links both captures',
);

// --- exact duplicate
const c3 = await capture(
  a,
  "Amazon initiated my refund of ₹2,499 yesterday, but I haven't received the money yet.",
);
check(
  c3.status === 'DUPLICATE' && c3.suggestion?.kind === 'DUPLICATE',
  'exact re-share detected as duplicate',
);

// --- J4 informational
const c4 = await capture(
  a,
  'Your OTP for login is 482913. Do not share it with anyone.',
);
check(
  c4.status === 'NO_COMMITMENT' && c4.suggestion?.kind === 'NOT_ACTIONABLE',
  'OTP message is not actionable',
);

// --- J3 ambiguous: two open Swiggy ₹499 refunds, then "refund processed" without an order id
for (const t of [
  'Swiggy refund of ₹499 for my order is pending.',
  'Another Swiggy refund of ₹499 is pending for a different order.',
]) {
  const cc = await capture(a, t);
  // The 2nd one is flagged as possibly the same case; the user says it is something new.
  await a.gql(
    `mutation($id: ID!){ approveSuggestion(id:$id, forceNew:true){ case { id } } }`,
    { id: cc.suggestion.id },
  );
}
const c5 = await capture(a, 'Your Swiggy refund of ₹499 is processed.');
check(
  c5.suggestion?.targetCaseId === null &&
    c5.suggestion?.candidates.length === 2,
  `ambiguous match lists both cases and picks none (${c5.suggestion?.kind})`,
);

const queue = (await a.gql('{ suggestions { id } }')).data.suggestions;
check(queue.some((q) => q.id === c5.suggestion.id), 'ambiguous update appears in the review queue');

// --- user edits before approving
const c6 = await capture(
  a,
  'Dell service center will call me within 3 days about my laptop repair, ticket SR 7788123.',
);
const ed = await a.gql(
  `mutation($id: ID!, $e: SuggestionEditsInput){ approveSuggestion(id:$id, edits:$e){ case { id title counterpartyName } } }`,
  {
    id: c6.suggestion.id,
    e: {
      title: 'Laptop repair — Dell',
      counterpartyName: 'Dell Service Center Koramangala',
    },
  },
);
check(
  ed.data?.approveSuggestion?.case?.title === 'Laptop repair — Dell',
  'edits are applied on approval',
);
check(
  c6.suggestion.proposed.deadline?.kind === 'ESTIMATED',
  '"within 3 days" is an estimate, not an explicit deadline',
);

// --- dashboard
const dash = (
  await a.gql(
    '{ dashboard { openCases resolvedCases pendingSuggestions waitingOnOthers { id } } }',
  )
).data.dashboard;
check(
  dash.openCases === 3 && dash.resolvedCases === 1,
  `dashboard counts (open ${dash.openCases}, resolved ${dash.resolvedCases}, pending ${dash.pendingSuggestions})`,
);

// --- isolation: another user cannot see or touch user A's data
const b = client();
await register(b, `b-${Date.now()}@example.com`);
const peek = await b.gql(`query($id: ID!){ case(id:$id){ id title } }`, {
  id: case1.id,
});
check(
  peek.errors?.[0]?.extensions?.code === 'NOT_FOUND' && !peek.data,
  "user B cannot read user A's case",
);
const poke = await b.gql(
  `mutation($id: ID!){ changeCaseStatus(id:$id, status:"OPEN"){ id } }`,
  { id: case1.id },
);
check(
  poke.errors?.[0]?.extensions?.code === 'NOT_FOUND',
  "user B cannot modify user A's case",
);
const peekCap = await b.gql(`query($id: ID!){ capture(id:$id){ id } }`, {
  id: c1.id,
});
check(
  peekCap.errors?.[0]?.extensions?.code === 'NOT_FOUND',
  "user B cannot read user A's capture",
);
check(
  (await b.gql('{ cases { id } }')).data.cases.length === 0,
  'user B sees an empty case list',
);

// --- uploads: reject non-images, accept a screenshot and OCR it
const fake = new FormData();
fake.append(
  'file',
  new Blob([Buffer.from('<?php echo 1; ?>')], { type: 'image/png' }),
  'evil.png',
);
check(
  (await a.call('/api/uploads', { method: 'POST', body: fake })).status === 400,
  'non-image disguised as PNG is rejected',
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260"><rect width="100%" height="100%" fill="white"/>
<text x="30" y="80" font-family="Arial" font-size="34" fill="black">Your refund of Rs. 1,299 from Flipkart</text>
<text x="30" y="140" font-family="Arial" font-size="34" fill="black">has been initiated. It will be credited</text>
<text x="30" y="200" font-family="Arial" font-size="34" fill="black">within 5-7 business days.</text></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'shot.png');
const up = await a.call('/api/uploads', { method: 'POST', body: form });
const upBody = await up.json();
check(up.status === 201 && upBody.attachmentId, 'screenshot upload accepted');
const sc = await a.gql(
  `mutation($i: CreateScreenshotCaptureInput!){ createScreenshotCapture(input:$i){ id } }`,
  { i: { attachmentId: upBody.attachmentId, clientRequestId: randomUUID() } },
);
const shot = await waitFor(a, sc.data.createScreenshotCapture.id);
console.log(
  `OCR (${shot.ocrConfidence}%): ${JSON.stringify(shot.extractedText)}`,
);
check(
  shot.suggestion?.proposed.category === 'REFUND' &&
    shot.suggestion?.proposed.counterparty?.value === 'Flipkart',
  `screenshot -> OCR -> suggestion (${shot.status}, ${shot.suggestion?.proposed.title})`,
);
const imgB = await b.call(`/api/attachments/${upBody.attachmentId}/content`);
check(imgB.status === 404, "user B cannot download user A's screenshot");
const imgA = await a.call(`/api/attachments/${upBody.attachmentId}/content`);
check(
  imgA.status === 200 && imgA.headers.get('content-type') === 'image/webp',
  'owner can view the sanitized (re-encoded) image',
);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
