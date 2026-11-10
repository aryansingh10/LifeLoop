import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  datetime,
  double,
  index,
  int,
  json,
  mediumtext,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Conventions
 * - IDs: CHAR(36) UUIDv7 generated in the app (MySQL has no RETURNING).
 * - Timestamps: DATETIME(3) in UTC.
 * - Every user-owned row carries user_id and every query is scoped by it.
 * - Enum-like columns are VARCHAR validated in code (no ALTER TABLE per new value).
 */
const id = (name = 'id') => char(name, { length: 36 });
const createdAt = () =>
  datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  datetime('updated_at', { mode: 'date', fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());
const ts = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

// ---------------------------------------------------------------- identity
export const users = mysqlTable(
  'users',
  {
    id: id().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    defaultCurrency: char('default_currency', { length: 3 }).notNull().default('INR'),
    // Notification preferences
    emailNotifications: boolean('email_notifications').notNull().default(true),
    digestEnabled: boolean('digest_enabled').notNull().default(true),
    digestHour: int('digest_hour').notNull().default(9), // local hour 0-23
    lastDigestDate: varchar('last_digest_date', { length: 10 }), // YYYY-MM-DD in the user's timezone
    /** Set when ownership of the email is proven (e.g. Google sign-in with a verified email). */
    emailVerifiedAt: ts('email_verified_at'),
    /** Sessions issued before this instant are rejected ("sign out everywhere"). */
    sessionsValidAfter: ts('sessions_valid_after'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

/** Single-use tokens sent by email (verify email; later: password reset). Only a hash is stored. */
export const authTokens = mysqlTable(
  'auth_tokens',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: varchar('purpose', { length: 24 }).notNull(), // VERIFY_EMAIL
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash), index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);

/** External sign-in identities (Google). One provider account maps to exactly one LifeLoop user. */
export const userIdentities = mysqlTable(
  'user_identities',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 16 }).notNull(), // GOOGLE
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(), // Google "sub" (stable account id)
    emailAtLink: varchar('email_at_link', { length: 320 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('user_identities_provider_subject_uq').on(t.provider, t.providerSubject),
    uniqueIndex('user_identities_user_provider_uq').on(t.userId, t.provider),
  ],
);

// ---------------------------------------------------------------- notifications
export const notifications = mysqlTable(
  'notifications',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caseId: id('case_id'),
    kind: varchar('kind', { length: 24 }).notNull(), // FOLLOW_UP_DUE | DEADLINE_SOON | OVERDUE | TEST
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 500 }).notNull(),
    /** Guarantees each reminder is created once, e.g. "followup:<caseId>:<followupAt>". */
    dedupeKey: varchar('dedupe_key', { length: 191 }).notNull(),
    readAt: ts('read_at'),
    emailedAt: ts('emailed_at'),
    emailAttempts: int('email_attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notifications_user_dedupe_uq').on(t.userId, t.dedupeKey),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_email_idx').on(t.emailedAt, t.emailAttempts),
  ],
);

// ---------------------------------------------------------------- files
export const attachments = mysqlTable(
  'attachments',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull(), // IMAGE | AUDIO
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    originalMime: varchar('original_mime', { length: 64 }).notNull(),
    storedMime: varchar('stored_mime', { length: 64 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    width: int('width'),
    height: int('height'),
    durationMs: int('duration_ms'), // audio only
    createdAt: createdAt(),
  },
  (t) => [index('attachments_user_idx').on(t.userId), index('attachments_user_sha_idx').on(t.userId, t.sha256)],
);

// ---------------------------------------------------------------- captures (immutable input)
export const captures = mysqlTable(
  'captures',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 16 }).notNull(), // TEXT | PASTE | SCREENSHOT | VOICE
    /** Voice notes: language spoken ('en' transcribed as-is, 'hi' = Hindi/Hinglish translated to English). */
    language: varchar('language', { length: 8 }),
    rawText: mediumtext('raw_text'),
    attachmentId: id('attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
    note: varchar('note', { length: 500 }),
    normalizedText: mediumtext('normalized_text'), // set once (typed text, or OCR output)
    editedText: mediumtext('edited_text'), // user correction (e.g. bad OCR); never overwrites the original
    ocrConfidence: double('ocr_confidence'),
    contentHash: char('content_hash', { length: 64 }),
    clientRequestId: char('client_request_id', { length: 36 }).notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    failureCode: varchar('failure_code', { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('captures_user_client_req_uq').on(t.userId, t.clientRequestId),
    index('captures_user_created_idx').on(t.userId, t.createdAt),
    index('captures_user_hash_idx').on(t.userId, t.contentHash),
  ],
);

// ---------------------------------------------------------------- processing output
export const extractionRuns = mysqlTable(
  'extraction_runs',
  {
    id: id().primaryKey(),
    captureId: id('capture_id')
      .notNull()
      .references(() => captures.id, { onDelete: 'cascade' }),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stage: varchar('stage', { length: 16 }).notNull(), // OCR | EXTRACT
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 64 }),
    promptVersion: varchar('prompt_version', { length: 32 }),
    inputHash: char('input_hash', { length: 64 }),
    rawOutput: json('raw_output'),
    validatedOutput: json('validated_output'),
    validationIssues: json('validation_issues').$type<string[]>(),
    tokensIn: int('tokens_in'),
    tokensOut: int('tokens_out'),
    latencyMs: int('latency_ms'),
    status: varchar('status', { length: 16 }).notNull(), // SUCCEEDED | INVALID | FAILED
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('extraction_runs_capture_idx').on(t.captureId)],
);

// ---------------------------------------------------------------- cases (user-approved, trusted)
export const cases = mysqlTable(
  'cases',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 32 }).notNull(),
    commitmentType: varchar('commitment_type', { length: 32 }).notNull(),
    waitingOn: varchar('waiting_on', { length: 16 }).notNull(),
    counterpartyName: varchar('counterparty_name', { length: 200 }),
    counterpartyNormalized: varchar('counterparty_normalized', { length: 200 }),
    status: varchar('status', { length: 16 }).notNull(), // OPEN | SNOOZED | RESOLVED | CLOSED
    statusLabel: varchar('status_label', { length: 120 }),
    lifecycleStage: varchar('lifecycle_stage', { length: 32 }),
    nextAction: varchar('next_action', { length: 300 }),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: char('currency', { length: 3 }),
    deadlineAt: ts('deadline_at'),
    deadlineKind: varchar('deadline_kind', { length: 16 }).notNull().default('NONE'), // EXPLICIT | ESTIMATED | NONE
    deadlineEvidence: varchar('deadline_evidence', { length: 300 }),
    followupAt: ts('followup_at'),
    snoozedUntil: ts('snoozed_until'),
    resolvedAt: ts('resolved_at'),
    version: int('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('cases_user_status_followup_idx').on(t.userId, t.status, t.followupAt),
    index('cases_user_counterparty_idx').on(t.userId, t.counterpartyNormalized, t.status),
    index('cases_user_amount_idx').on(t.userId, t.amountMinor),
  ],
);

export const caseIdentifiers = mysqlTable(
  'case_identifiers',
  {
    id: id().primaryKey(),
    caseId: id('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 24 }).notNull(),
    valueNormalized: varchar('value_normalized', { length: 120 }).notNull(),
    valueDisplay: varchar('value_display', { length: 120 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('case_identifiers_uq').on(t.caseId, t.kind, t.valueNormalized),
    index('case_identifiers_user_value_idx').on(t.userId, t.valueNormalized),
  ],
);

export const caseCaptures = mysqlTable(
  'case_captures',
  {
    caseId: id('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    captureId: id('capture_id')
      .notNull()
      .references(() => captures.id, { onDelete: 'cascade' }),
    suggestionId: id('suggestion_id'),
    linkedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.captureId] })],
);

export const caseEvents = mysqlTable(
  'case_events',
  {
    id: id().primaryKey(),
    caseId: id('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    actor: varchar('actor', { length: 16 }).notNull(), // USER | SYSTEM
    fromValue: json('from_value'),
    toValue: json('to_value'),
    note: text('note'),
    captureId: id('capture_id'),
    sourceSuggestionId: id('source_suggestion_id'),
    createdAt: createdAt(),
  },
  (t) => [index('case_events_case_created_idx').on(t.caseId, t.createdAt)],
);

// ---------------------------------------------------------------- suggestions (AI proposals awaiting review)
export const suggestions = mysqlTable(
  'suggestions',
  {
    id: id().primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    captureId: id('capture_id')
      .notNull()
      .references(() => captures.id, { onDelete: 'cascade' }),
    extractionRunId: id('extraction_run_id').references(() => extractionRuns.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 24 }).notNull(), // NEW_CASE | UPDATE_CASE | DUPLICATE | NOT_ACTIONABLE
    proposed: json('proposed').notNull(),
    targetCaseId: id('target_case_id').references(() => cases.id, { onDelete: 'set null' }),
    duplicateOfCaptureId: id('duplicate_of_capture_id'),
    confidenceScore: double('confidence_score').notNull(),
    confidenceBand: varchar('confidence_band', { length: 8 }).notNull(),
    confidenceFactors: json('confidence_factors').notNull(),
    scoringVersion: varchar('scoring_version', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(), // PENDING | APPROVED | REJECTED | ATTACHED | SUPERSEDED
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('suggestions_user_status_idx').on(t.userId, t.status, t.createdAt),
    index('suggestions_capture_idx').on(t.captureId),
  ],
);

export const suggestionMatchCandidates = mysqlTable(
  'suggestion_match_candidates',
  {
    id: id().primaryKey(),
    suggestionId: id('suggestion_id')
      .notNull()
      .references(() => suggestions.id, { onDelete: 'cascade' }),
    caseId: id('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    score: double('score').notNull(),
    strength: varchar('strength', { length: 8 }).notNull(), // STRONG | MEDIUM | WEAK
    reasons: json('reasons').$type<string[]>().notNull(),
    rank: int('rank').notNull(),
  },
  (t) => [uniqueIndex('smc_suggestion_case_uq').on(t.suggestionId, t.caseId)],
);

export const suggestionReviews = mysqlTable(
  'suggestion_reviews',
  {
    id: id().primaryKey(),
    suggestionId: id('suggestion_id')
      .notNull()
      .references(() => suggestions.id, { onDelete: 'cascade' }),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 24 }).notNull(), // APPROVE | EDIT_APPROVE | REJECT | ATTACH
    fieldDiff: json('field_diff'),
    rejectReason: varchar('reject_reason', { length: 64 }),
    resultingCaseId: id('resulting_case_id'),
    createdAt: createdAt(),
  },
  (t) => [index('suggestion_reviews_suggestion_idx').on(t.suggestionId)],
);

// ---------------------------------------------------------------- background jobs (DB-backed queue)
export const jobs = mysqlTable(
  'jobs',
  {
    id: id().primaryKey(),
    type: varchar('type', { length: 64 }).notNull(),
    payload: json('payload').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 16 }).notNull(), // QUEUED | RUNNING | SUCCEEDED | DEAD
    attempts: int('attempts').notNull().default(0),
    maxAttempts: int('max_attempts').notNull().default(3),
    runAt: datetime('run_at', { mode: 'date', fsp: 3 }).notNull(),
    lockedUntil: ts('locked_until'),
    lockedBy: varchar('locked_by', { length: 64 }),
    lastError: text('last_error'),
    dedupeKey: varchar('dedupe_key', { length: 191 }),
    userId: id('user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('jobs_status_run_at_idx').on(t.status, t.runAt), uniqueIndex('jobs_dedupe_uq').on(t.dedupeKey)],
);

export type UserRow = typeof users.$inferSelect;
export type CaptureRow = typeof captures.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type CaseEventRow = typeof caseEvents.$inferSelect;
export type CaseIdentifierRow = typeof caseIdentifiers.$inferSelect;
export type SuggestionRow = typeof suggestions.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type MatchCandidateRow = typeof suggestionMatchCandidates.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type UserIdentityRow = typeof userIdentities.$inferSelect;
