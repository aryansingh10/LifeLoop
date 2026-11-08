import { assertReminderDate } from '../cases/cases.service.js';
import { localDayKey, startOfLocalDay } from '../extraction/dates.js';
import { dueReminders, type ReminderCase } from './reminder-rules.js';

const NOW = new Date('2026-11-08T06:00:00Z'); // 11:30 IST
const H = 3600 * 1000;
const base: ReminderCase = {
  id: 'c1',
  title: 'Amazon refund ₹2,499',
  status: 'OPEN',
  waitingOn: 'OTHER_PARTY',
  counterpartyName: 'Amazon',
  nextAction: "Follow up if the money hasn't arrived",
  followupAt: null,
  deadlineAt: null,
  deadlineKind: 'NONE',
};

describe('reminder rules', () => {
  it('fires a follow-up reminder once the follow-up time has passed', () => {
    const r = dueReminders([{ ...base, followupAt: new Date(NOW.getTime() - H) }], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('FOLLOW_UP_DUE');
    expect(r[0].body).toContain('Amazon');
  });

  it('does not fire for future follow-ups', () => {
    expect(dueReminders([{ ...base, followupAt: new Date(NOW.getTime() + H) }], NOW)).toHaveLength(0);
  });

  it('warns a day before a deadline, then once when overdue', () => {
    const soon = dueReminders([{ ...base, deadlineAt: new Date(NOW.getTime() + 5 * H), deadlineKind: 'EXPLICIT' }], NOW);
    expect(soon.map((r) => r.kind)).toEqual(['DEADLINE_SOON']);
    const late = dueReminders([{ ...base, deadlineAt: new Date(NOW.getTime() - 5 * H), deadlineKind: 'EXPLICIT' }], NOW);
    expect(late.map((r) => r.kind)).toEqual(['OVERDUE']);
  });

  it('says "today" or "tomorrow" correctly in the user timezone', () => {
    // NOW is 11:30 IST; 18:00 IST today vs 10:00 IST tomorrow
    const today = dueReminders([{ ...base, deadlineAt: new Date('2026-11-08T12:30:00Z'), deadlineKind: 'EXPLICIT', timeZone: 'Asia/Kolkata' }], NOW);
    const tomorrow = dueReminders([{ ...base, deadlineAt: new Date('2026-11-09T04:30:00Z'), deadlineKind: 'EXPLICIT', timeZone: 'Asia/Kolkata' }], NOW);
    expect(today[0].title).toBe('Due today: Amazon refund ₹2,499');
    expect(tomorrow[0].title).toBe('Due tomorrow: Amazon refund ₹2,499');
  });

  it('labels estimated deadlines as expected dates, not hard deadlines', () => {
    const r = dueReminders([{ ...base, deadlineAt: new Date(NOW.getTime() - H), deadlineKind: 'ESTIMATED' }], NOW);
    expect(r[0].title.startsWith('Expected date passed')).toBe(true);
  });

  it('ignores resolved, closed and snoozed cases', () => {
    const past = new Date(NOW.getTime() - H);
    for (const status of ['RESOLVED', 'CLOSED', 'SNOOZED']) {
      expect(dueReminders([{ ...base, status, followupAt: past, deadlineAt: past }], NOW)).toHaveLength(0);
    }
  });

  it('dedupe key changes when the date changes, so a rescheduled follow-up reminds again', () => {
    const a = dueReminders([{ ...base, followupAt: new Date(NOW.getTime() - H) }], NOW)[0];
    const b = dueReminders([{ ...base, followupAt: new Date(NOW.getTime() - 2 * H) }], NOW)[0];
    const again = dueReminders([{ ...base, followupAt: new Date(NOW.getTime() - H) }], NOW)[0];
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
    expect(a.dedupeKey).toBe(again.dedupeKey);
  });
});

describe('reminder dates', () => {
  const TZ = 'Asia/Kolkata';
  it('rejects dates before today in the user timezone', () => {
    expect(() => assertReminderDate(new Date('2026-11-07T10:00:00Z'), TZ, NOW)).toThrow('today or later');
  });
  it('accepts a time earlier today but moves it to now (fires on the next run)', () => {
    const earlierToday = new Date('2026-11-08T00:30:00Z'); // 06:00 IST today
    expect(assertReminderDate(earlierToday, TZ, NOW).getTime()).toBe(NOW.getTime());
  });
  it('accepts future dates unchanged', () => {
    const later = new Date('2026-11-10T04:30:00Z');
    expect(assertReminderDate(later, TZ, NOW).getTime()).toBe(later.getTime());
  });
  it('computes the local day and hour', () => {
    expect(localDayKey(NOW, TZ)).toEqual({ day: '2026-11-08', hour: 11 });
    expect(startOfLocalDay(NOW, TZ).toISOString()).toBe('2026-11-07T18:30:00.000Z');
  });
});
