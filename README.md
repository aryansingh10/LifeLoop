# LifeLoop (prototype)

Personal follow-through tracker: share a message, email or screenshot once; LifeLoop suggests what needs tracking; you approve it; it keeps the case until it's resolved.

**Nothing becomes a tracked case without your approval.**

## What works in this prototype

- Email + password accounts (httpOnly session cookie)
- Google sign-in (OpenID Connect with PKCE; only name + email are requested). An existing password account is linked only after you log in with its password once. Connect or disconnect from Settings.
- Capture by typing, pasting, or uploading/pasting a screenshot (PNG/JPEG/WebP ≤ 5 MB)
- Voice notes: record (up to 2 min) or upload audio; transcribed locally with Whisper (free, offline).
  - English: `whisper-base`.
  - Hindi/Hinglish: `whisper-large-v3-turbo`, transcribed as Hindi and written out in Roman letters ("kal mera Myntra ka refund aane wala hai 500 rupees ka"). This model needs ~2.7 GB RAM and takes ~10–20 s per note.
  - Brand names misheard by speech-to-text ("FlipCart", "Mentra", "Geomart") are matched to the real brand.
- Screenshot OCR with Tesseract.js (runs locally; language data downloads once on first use)
- AI extraction into a validated schema
  - `AI_PROVIDER=mock`: offline rule-based extractor, free, the default
  - `AI_PROVIDER=anthropic`: Claude (structured outputs) with your API key
- Evidence checks: any value the AI returns that isn't backed by a quote from your input is dropped. Dates are computed in code, and estimates ("5–7 business days") are labelled as estimates.
- Explainable confidence (High / Please check / Unsure)
- Matching to existing cases: exact duplicates, same reference number, same company + amount. Ambiguous matches ask you to choose; nothing is merged automatically.
- Review flow: approve, edit and approve, "it's something new", add to a chosen case, reject
- Cases with a timeline, notes, follow-up dates, snooze, resolve, close and reopen
- Dashboard: needs your action, waiting on others, follow up soon, recently resolved
- Reminders: a scheduler runs every minute and creates in-app notifications (the bell) for due follow-ups, deadlines due today/tomorrow, and overdue items, each exactly once
- Email: one batched email per run for new reminders, plus an optional morning digest. Settings page with on/off switches and a test email
- Follow-up dates must be today or later; LifeLoop never suggests a follow-up in the past

- Email verification links, "Forgot password?" (also lets Google-only users add a password); setting a password signs out all other devices
- Installable phone app (PWA, Android): appears in the Share menu of WhatsApp, Gallery, Gmail and others, so screenshots, voice notes and messages go straight into LifeLoop. Reminders also arrive as phone notifications; tapping one opens the case

**Not yet built:** Gmail/forwarding, deployment, a Play Store app. See the architecture plan for the roadmap.

## Stack

| | |
|---|---|
| API | NestJS 12 (ESM), GraphQL (Apollo Server 5, code-first), Drizzle ORM, MySQL 8, Zod, Vitest |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query |
| Background jobs | MySQL-backed job table with an in-process worker (`FOR UPDATE SKIP LOCKED`, retries with backoff, dead-lettering). No Redis needed. |

## Run it locally

Requirements: Node 24+, MySQL 8 running locally.

```bash
npm install                      # once, from the repo root

# 1. Configure the API
#    apps/api/.env already exists (JWT secret generated). Set your MySQL credentials:
#    DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/lifeloop
#    (if the password has special characters, URL-encode them, e.g. @ -> %40)

# 2. Create the database and tables
npm run db:migrate

# 3. Start API (http://localhost:4000) and web (http://localhost:3000)
npm run dev
```

Open http://localhost:3000, create an account, and try one of the example captures.

### Use Claude instead of the mock extractor

In `apps/api/.env`:

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-5-5
```

### Enable Google sign-in

1. Go to https://console.cloud.google.com/ and create a project (e.g. "LifeLoop")
2. **APIs & Services → OAuth consent screen**: choose *External*, app name "LifeLoop", your email as support/developer contact. Scopes: just the defaults (`openid`, `email`, `profile`). While the app is in *Testing*, add the Google accounts that may sign in under **Test users**
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type *Web application*, Authorized redirect URI `http://localhost:3000/api/auth/google/callback`
4. Put the client ID and secret in `apps/api/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and restart `npm run dev`. The "Continue with Google" button appears on the login and register pages

### Receive reminder emails in your inbox

By default (`EMAIL_PROVIDER=console`) emails are printed in the API terminal and saved in `apps/api/storage/outbox/`. To really send them, for example with Gmail:

1. Turn on 2-Step Verification for your Google account
2. Create an App Password at https://myaccount.google.com/apppasswords
3. In `apps/api/.env`:
   ```
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASS=your16charapppassword
   EMAIL_FROM=LifeLoop <you@gmail.com>
   ```
4. Restart `npm run dev`, then use **Settings → Send me a test email**

### Hindi OCR

Set `OCR_LANGS=eng+hin`. This downloads the extra language data on the first screenshot.

### Phone app (Android)

LifeLoop is a Progressive Web App: no app store needed.

1. **Push keys.** Generate them once with `npx web-push generate-vapid-keys`, then put them in `apps/api/.env` as `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:you@example.com`. Restart `npm run dev`.
2. **HTTPS.** Phones only allow installing, sharing and notifications over HTTPS (`localhost` is the only exception, and that only works on the computer itself). To try it on a phone before deploying, expose port 3000 through a tunnel such as Cloudflare Tunnel or ngrok. Then:
   - set `APP_URL` in `apps/api/.env` to the tunnel URL
   - add `<tunnel URL>/api/auth/google/callback` as a Google redirect URI (and set `GOOGLE_REDIRECT_URI` to it) if you use Google sign-in
3. **On the phone.** Open the HTTPS URL in Chrome, log in, then go to **Settings → Phone app**:
   - **Install LifeLoop** (or Chrome menu ⋮ → *Install app*)
   - **Turn on notifications**, then **Send a test**
4. **Try it.** In WhatsApp, long-press a message or open a screenshot, tap **Share** and choose **LifeLoop**. The Track screen opens with it filled in.

How it works:
- `apps/web/public/sw.js` is the service worker. It receives shares and shows notifications.
- `apps/web/src/app/manifest.ts` is the app manifest and share target.
- `apps/api/src/modules/push/` holds subscriptions and sending. The API only sends to the real browser push services (Google, Mozilla, Apple, Microsoft).
- Shared files stay on the phone only until the Track screen opens them.
- Icons are generated by `node apps/web/scripts/make-icons.mjs`.

## Tests

```bash
npm test                         # unit tests: dates, money, evidence checks, mock extraction, matching
npm run eval -w apps/api         # extraction quality: 1,000 labelled messages (add -- --set=heldout or --set=fresh for unseen sets, -- --failures to list mistakes)
npm run e2e -w apps/api          # end-to-end against a running API (uses the mock AI): 31 checks incl. OCR and data isolation
```

### Extraction evaluation sets (offline rule-based extractor)

| Set | Command (`npm run eval -w apps/api -- …`) | Size | What it is |
|---|---|---|---|
| tuning | *(default)* | 1,000 | Hand-written patterns the rules were first built on |
| heldout / fresh | `--set=heldout`, `--set=fresh` | 100 / 60 | Hand-written, never tuned on |
| large | `--set=large --patterns` | 100,000 | ~250 English + Hinglish templates × slot values × WhatsApp noise (lowercase, emojis, "Hi sir,", no punctuation). Every 4th template is held out (`--split=test`); `--lang=hi` for Hinglish only |
| blind | `--set=blind` | 10,000 | ~60 templates written after tuning, with new wording and brands outside the dictionary |

`--patterns` groups failures by template and field, biggest first. The large set takes ~1–2 minutes.

Results for rules-v3:

| | Large: before → after | Blind: first run → after |
|---|---|---|
| Something to track? | 95.1% → 100% | 95.7% → 100% |
| Category | 90.5% → 99.9% | 67.1% → 100% |
| Who acts next | 89.9% → 100% | 81.1% → 100% |
| Company / person | 87.0% → 99.9% | 85.0% → 98.5% |
| Amount | 89.9% → 100% | 100% → 100% |
| Deadline | 79.5% → 100% | 96.3% → 100% |
| Invented values | 18.8% → 0% | 0% → 0% |

The **blind first run** is the honest estimate for wording the rules have never seen. Amounts and dates generalize because they are formats. Category and "who acts next" depend on vocabulary, so new phrasings will keep turning up gaps. That is what the Claude provider (`AI_PROVIDER=anthropic`) is for.

## Layout

```
apps/api/src
  config/            env validation (fails fast)
  common/            auth guard (default deny), ids (UUIDv7), hashing
  database/          Drizzle schema + module            (migrations in apps/api/drizzle)
  graphql/           GraphQL types, mappers, resolvers
  modules/
    auth, users      register/login/logout, profile
    attachments      validated, re-encoded uploads
    storage          local-disk storage (swappable for S3/R2)
    captures         immutable user input, idempotent creation
    jobs             DB-backed queue + worker
    ocr              Tesseract.js
    ai               provider interface, Claude adapter, mock extractor, prompt
    extraction       schema, validation (evidence/dates/money), confidence
    matching         duplicate/update detection
    suggestions      review actions (one transaction each)
    cases            case state machine, timeline, dashboard
    processing       pipeline job handlers
apps/web/src
  app/               pages (landing, auth, dashboard, captures/[id], suggestions, cases, cases/[id])
  components/        capture box, suggestion review, UI primitives
  lib/               API client, GraphQL documents, types, formatting
```
