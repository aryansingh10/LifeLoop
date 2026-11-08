import { Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { caseEvents, cases, notifications, suggestions, users, type NotificationRow, type UserRow } from '../../database/schema.js';
import { env } from '../../config/env.js';
import { localDayKey } from '../extraction/dates.js';
import { needsReview } from '../suggestions/review-queue.js';
import { EmailService, escapeHtml } from '../email/email.service.js';
import { dueReminders, type DueReminder } from './reminder-rules.js';

const MAX_EMAIL_ATTEMPTS = 3;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectDb() private readonly db: DB,
    private readonly email: EmailService,
  ) {}

  // ------------------------------------------------------------------ queries for the app

  async list(userId: string, limit = 30): Promise<NotificationRow[]> {
    return this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  async unreadCount(userId: string): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return r?.n ?? 0;
  }

  /** Marks the given notifications (or all, when ids is empty/null) as read. Returns how many changed. */
  async markRead(userId: string, ids: string[] | null | undefined): Promise<number> {
    const conds = [eq(notifications.userId, userId), isNull(notifications.readAt)];
    if (ids?.length) conds.push(inArray(notifications.id, ids));
    const res = await this.db.update(notifications).set({ readAt: new Date() }).where(and(...conds));
    return (res[0] as { affectedRows?: number }).affectedRows ?? 0;
  }

  // ------------------------------------------------------------------ scheduler steps

  /** Snoozed cases whose snooze ended go back to OPEN (with a timeline entry). */
  async wakeSnoozed(now: Date): Promise<number> {
    const due = await this.db
      .select({ id: cases.id, userId: cases.userId })
      .from(cases)
      .where(and(eq(cases.status, 'SNOOZED'), lte(cases.snoozedUntil, now)))
      .limit(500);
    for (const c of due) {
      await this.db.transaction(async (tx) => {
        const res = await tx
          .update(cases)
          .set({ status: 'OPEN', snoozedUntil: null, version: sql`${cases.version} + 1` })
          .where(and(eq(cases.id, c.id), eq(cases.status, 'SNOOZED')));
        if ((res[0] as { affectedRows?: number }).affectedRows) {
          await tx.insert(caseEvents).values({
            id: uuidv7(),
            caseId: c.id,
            userId: c.userId,
            type: 'STATUS_CHANGED',
            actor: 'SYSTEM',
            fromValue: { status: 'SNOOZED' },
            toValue: { status: 'OPEN' },
            note: 'Snooze ended',
          });
        }
      });
    }
    return due.length;
  }

  /** Creates in-app notifications for every reminder that is due. Idempotent via dedupe keys. */
  async createDueReminders(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + 24 * 3600 * 1000);
    const rows = await this.db
      .select({ c: cases, timeZone: users.timezone })
      .from(cases)
      .innerJoin(users, eq(users.id, cases.userId))
      .where(
        and(
          eq(cases.status, 'OPEN'),
          sql`(${cases.followupAt} <= ${now} OR ${cases.deadlineAt} <= ${horizon})`,
        ),
      )
      .limit(2000);
    let created = 0;
    const owners = new Map(rows.map((r) => [r.c.id, r.c.userId]));
    for (const r of dueReminders(rows.map((r) => ({ ...r.c, timeZone: r.timeZone })), now)) {
      const owner = owners.get(r.caseId)!;
      if (await this.insert(owner, r)) created++;
    }
    return created;
  }

  private async insert(userId: string, r: DueReminder | (Omit<DueReminder, 'caseId'> & { caseId: string | null; kind: string })) {
    const res = await this.db
      .insert(notifications)
      .ignore() // an existing dedupe key means this reminder was already created
      .values({ id: uuidv7(), userId, caseId: r.caseId, kind: r.kind, title: r.title.slice(0, 200), body: r.body.slice(0, 500), dedupeKey: r.dedupeKey });
    return (res[0] as { affectedRows?: number }).affectedRows === 1;
  }

  /** Emails new notifications, one batched email per user per run. Failures retry up to 3 times. */
  async emailPending(now: Date): Promise<number> {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const pending = await this.db
      .select({ n: notifications, user: users })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(
        and(
          isNull(notifications.emailedAt),
          lt(notifications.emailAttempts, MAX_EMAIL_ATTEMPTS),
          gte(notifications.createdAt, since),
          eq(users.emailNotifications, true),
          sql`${notifications.kind} <> 'TEST'`,
        ),
      )
      .orderBy(notifications.createdAt)
      .limit(500);

    const byUser = new Map<string, { user: UserRow; items: NotificationRow[] }>();
    for (const p of pending) {
      const g = byUser.get(p.user.id) ?? { user: p.user, items: [] };
      g.items.push(p.n);
      byUser.set(p.user.id, g);
    }

    let sent = 0;
    for (const { user, items } of byUser.values()) {
      const ids = items.map((i) => i.id);
      try {
        const subject = items.length === 1 ? items[0].title : `LifeLoop: ${items.length} things need your attention`;
        await this.email.send({ to: user.email, ...renderReminderEmail(user.displayName, items, subject) });
        await this.db.update(notifications).set({ emailedAt: new Date() }).where(inArray(notifications.id, ids));
        sent++;
      } catch (err) {
        this.logger.warn(`email to user ${user.id} failed: ${(err as Error).message}`);
        await this.db
          .update(notifications)
          .set({ emailAttempts: sql`${notifications.emailAttempts} + 1` })
          .where(inArray(notifications.id, ids));
      }
    }
    return sent;
  }

  /** Morning digest: once per local day at the user's chosen hour, only if something needs attention. */
  async sendDigests(now: Date): Promise<number> {
    const candidates = await this.db
      .select()
      .from(users)
      .where(and(eq(users.digestEnabled, true), eq(users.emailNotifications, true)))
      .limit(1000);
    let sent = 0;
    for (const u of candidates) {
      const { day, hour } = localDayKey(now, u.timezone);
      if (hour < u.digestHour || u.lastDigestDate === day) continue;
      // Claim today's digest first so a slow/failed send never produces duplicates.
      const claim = await this.db
        .update(users)
        .set({ lastDigestDate: day })
        .where(and(eq(users.id, u.id), sql`(${users.lastDigestDate} IS NULL OR ${users.lastDigestDate} <> ${day})`));
      if (!(claim[0] as { affectedRows?: number }).affectedRows) continue;

      const endOfDay = new Date(now.getTime() + 24 * 3600 * 1000);
      const open = await this.db
        .select()
        .from(cases)
        .where(and(eq(cases.userId, u.id), eq(cases.status, 'OPEN'), sql`(${cases.followupAt} <= ${endOfDay} OR ${cases.deadlineAt} <= ${endOfDay})`))
        .limit(50);
      const [pending] = await this.db.select({ n: count() }).from(suggestions).where(needsReview(this.db, u.id));
      if (open.length === 0 && (pending?.n ?? 0) === 0) continue;
      try {
        await this.email.send({ to: u.email, ...renderDigestEmail(u.displayName, open, pending?.n ?? 0, now) });
        sent++;
      } catch (err) {
        this.logger.warn(`digest to user ${u.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  async sendTestEmail(userId: string): Promise<string> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    await this.email.send({
      to: u.email,
      subject: 'LifeLoop test email',
      text: `Hi ${u.displayName},\n\nEmail reminders are working.\n\n${env().APP_URL}`,
      html: layout(`<p>Hi ${escapeHtml(u.displayName)},</p><p>Email reminders are working. 🎉</p>`),
    });
    return this.email.mode === 'smtp' ? `Test email sent to ${u.email}` : 'Email is in console mode: the test email was printed in the API terminal (see README to send real email)';
  }
}

// ------------------------------------------------------------------ email templates

function layout(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#1c1917">
<p style="font-weight:600;color:#1a7a68;font-size:18px">LifeLoop</p>${inner}
<p style="margin-top:24px;font-size:12px;color:#78716c">You get these emails because reminders are on. You can turn them off in LifeLoop → Settings.</p></div>`;
}

function renderReminderEmail(name: string, items: NotificationRow[], subject: string) {
  const app = env().APP_URL;
  const text = `Hi ${name},\n\n${items.map((i) => `• ${i.title}\n  ${i.body}\n  ${app}/cases/${i.caseId}`).join('\n\n')}\n\nOpen LifeLoop: ${app}/dashboard`;
  const list = items
    .map(
      (i) =>
        `<li style="margin-bottom:12px"><a href="${app}/cases/${i.caseId}" style="color:#1a7a68;font-weight:600">${escapeHtml(i.title)}</a><br><span style="color:#57534e">${escapeHtml(i.body)}</span></li>`,
    )
    .join('');
  return { subject, text, html: layout(`<p>Hi ${escapeHtml(name)},</p><ul style="padding-left:18px">${list}</ul><p><a href="${app}/dashboard">Open LifeLoop</a></p>`) };
}

function renderDigestEmail(name: string, open: Array<typeof cases.$inferSelect>, pending: number, now: Date) {
  const app = env().APP_URL;
  const overdue = open.filter((c) => (c.deadlineAt && c.deadlineAt <= now) || (c.followupAt && c.followupAt <= now));
  const today = open.filter((c) => !overdue.includes(c));
  const section = (title: string, rows: typeof open) =>
    rows.length
      ? `<p style="font-weight:600;margin-bottom:4px">${title}</p><ul style="padding-left:18px;margin-top:0">${rows
          .map((c) => `<li><a href="${app}/cases/${c.id}" style="color:#1a7a68">${escapeHtml(c.title)}</a>${c.counterpartyName ? ` — ${escapeHtml(c.counterpartyName)}` : ''}</li>`)
          .join('')}</ul>`
      : '';
  const reviewLine = pending ? `<p>${pending} new suggestion${pending > 1 ? 's' : ''} to review: <a href="${app}/suggestions">Review</a></p>` : '';
  const text = [
    `Hi ${name}, here's your LifeLoop for today.`,
    overdue.length ? `\nNeeds attention now:\n${overdue.map((c) => `• ${c.title}`).join('\n')}` : '',
    today.length ? `\nComing up today:\n${today.map((c) => `• ${c.title}`).join('\n')}` : '',
    pending ? `\n${pending} suggestion(s) to review: ${app}/suggestions` : '',
    `\n${app}/dashboard`,
  ].join('\n');
  return {
    subject: `Your LifeLoop today: ${open.length} to follow up${pending ? `, ${pending} to review` : ''}`,
    text,
    html: layout(`<p>Hi ${escapeHtml(name)}, here's your LifeLoop for today.</p>${section('Needs attention now', overdue)}${section('Coming up today', today)}${reviewLine}<p><a href="${app}/dashboard">Open LifeLoop</a></p>`),
  };
}
