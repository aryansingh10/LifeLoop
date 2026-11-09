# LifeLoop (prototype)

Personal follow-through tracker: share a message, email or screenshot once; LifeLoop suggests what needs tracking; you approve it; it keeps the case until it's resolved.

**Nothing becomes a tracked case without your approval.**

## What works in this prototype

- Email + password accounts (httpOnly session cookie)
- Google sign-in (OpenID Connect with PKCE; only name + email are requested). An existing password account is linked only after you log in with its password once. Connect or disconnect from Settings.
- Capture by typing, pasting, or uploading/pasting a screenshot (PNG/JPEG/WebP ≤ 5 MB)
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

**Not yet built:** browser push notifications, voice capture, Gmail/forwarding, deployment. See the architecture plan for the roadmap.

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

## Tests

```bash
npm test                         # unit tests: dates, money, evidence checks, mock extraction, matching
npm run e2e -w apps/api          # end-to-end against a running API (uses the mock AI): 31 checks incl. OCR and data isolation
```

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
