/**
 * Pure reminder rules: given a user's active cases and the current time, which reminders are due.
 * Each reminder has a dedupe key, so running this every minute creates each reminder exactly once.
 * A changed follow-up date or deadline produces a new key, i.e. a new reminder.
 */
import { localDayKey } from '../extraction/dates.js';

export type ReminderKind = 'FOLLOW_UP_DUE' | 'DEADLINE_SOON' | 'OVERDUE';

export interface ReminderCase {
  id: string;
  title: string;
  status: string;
  waitingOn: string;
  counterpartyName: string | null;
  nextAction: string | null;
  followupAt: Date | null;
  deadlineAt: Date | null;
  deadlineKind: string;
  /** Owner's timezone, used to say "today" vs "tomorrow". */
  timeZone?: string;
}

export interface DueReminder {
  caseId: string;
  kind: ReminderKind;
  dedupeKey: string;
  title: string;
  body: string;
}

const HOUR = 3600 * 1000;
const SOON_WINDOW = 24 * HOUR;

function who(c: ReminderCase): string {
  if (c.waitingOn === 'USER') return 'You need to act on this.';
  return c.counterpartyName ? `You're waiting on ${c.counterpartyName}.` : "You're waiting on someone.";
}

export function dueReminders(cases: ReminderCase[], now: Date): DueReminder[] {
  const out: DueReminder[] = [];
  for (const c of cases) {
    if (c.status !== 'OPEN') continue;
    const detail = c.nextAction ? `${c.nextAction}. ${who(c)}` : who(c);

    if (c.followupAt && c.followupAt.getTime() <= now.getTime()) {
      out.push({
        caseId: c.id,
        kind: 'FOLLOW_UP_DUE',
        dedupeKey: `followup:${c.id}:${c.followupAt.toISOString()}`,
        title: `Time to follow up: ${c.title}`,
        body: detail,
      });
    }

    if (c.deadlineAt) {
      const t = c.deadlineAt.getTime();
      const estimated = c.deadlineKind === 'ESTIMATED';
      if (t > now.getTime() && t - now.getTime() <= SOON_WINDOW) {
        const tz = c.timeZone ?? 'Asia/Kolkata';
        const when = localDayKey(c.deadlineAt, tz).day === localDayKey(now, tz).day ? 'today' : 'tomorrow';
        out.push({
          caseId: c.id,
          kind: 'DEADLINE_SOON',
          dedupeKey: `deadline-soon:${c.id}:${c.deadlineAt.toISOString()}`,
          title: `${estimated ? 'Expected' : 'Due'} ${when}: ${c.title}`,
          body: detail,
        });
      } else if (t <= now.getTime()) {
        out.push({
          caseId: c.id,
          kind: 'OVERDUE',
          dedupeKey: `overdue:${c.id}:${c.deadlineAt.toISOString()}`,
          title: `${estimated ? 'Expected date passed' : 'Overdue'}: ${c.title}`,
          body: estimated ? `It was expected by now. ${detail}` : detail,
        });
      }
    }
  }
  return out;
}
