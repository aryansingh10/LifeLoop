/**
 * Resolves human date expressions ("tomorrow", "within 3 days", "5-7 business days", "12 Nov")
 * against a reference instant in the user's timezone.
 *
 * The AI only returns the *expression*; this code computes the date, so a model can never
 * "invent" a precise date that the text does not support.
 */
export type DateKind = 'EXPLICIT' | 'ESTIMATED';

export interface ResolvedDate {
  date: Date;
  kind: DateKind;
}

interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
};
const NUM = '(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const toNum = (s: string): number => (/^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s] ?? NaN));

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in `timeZone` -> UTC instant. */
export function zonedToUtc(ymd: YMD, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, hour, minute);
  let result = guess - tzOffsetMs(guess, timeZone);
  result = guess - tzOffsetMs(result, timeZone); // second pass handles DST edges
  return new Date(result);
}

export function localDate(date: Date, timeZone: string): YMD {
  const p = zonedParts(date, timeZone);
  return { y: p.y, m: p.m, d: p.d };
}

function addDays(ymd: YMD, days: number): YMD {
  const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function weekday(ymd: YMD): number {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
}

function addBusinessDays(ymd: YMD, days: number): YMD {
  let cur = ymd;
  let left = days;
  while (left > 0) {
    cur = addDays(cur, 1);
    const wd = weekday(cur);
    if (wd !== 0 && wd !== 6) left--;
  }
  return cur;
}

const cmp = (a: YMD, b: YMD) => Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d);

function validYmd(y: number, m: number, d: number): YMD | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Picks the year for "12 Nov" style dates: next occurrence for deadlines, previous for past events. */
function withYear(m: number, d: number, yearText: string | undefined, ref: YMD, direction: 'future' | 'past'): YMD | null {
  if (yearText) {
    const y = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    return validYmd(y, m, d);
  }
  const thisYear = validYmd(ref.y, m, d);
  if (!thisYear) return null;
  if (direction === 'future' && cmp(thisYear, addDays(ref, -1)) < 0) return validYmd(ref.y + 1, m, d);
  if (direction === 'past' && cmp(thisYear, ref) > 0) return validYmd(ref.y - 1, m, d);
  return thisYear;
}

function resolveYmd(expr: string, ref: YMD, direction: 'future' | 'past'): { ymd: YMD; kind: DateKind } | null {
  // Hinglish: "2 din me" = in 2 days, "do hafte" = two weeks, "parso" = the day after (or before) tomorrow.
  const e = expr
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bdin\b/g, 'days')
    .replace(/\bhafte?\b/g, 'weeks')
    .replace(/\bparso\b/g, direction === 'future' ? 'day after tomorrow' : 'day before yesterday');
  let m: RegExpMatchArray | null;

  if (/\bday after tomorrow\b/.test(e)) return { ymd: addDays(ref, 2), kind: 'EXPLICIT' };
  if (/\bday before yesterday\b/.test(e)) return { ymd: addDays(ref, -2), kind: 'EXPLICIT' };
  if (/\btomorrow\b|\bkal\b/.test(e) && direction === 'future') return { ymd: addDays(ref, 1), kind: 'EXPLICIT' };
  if (/\byesterday\b/.test(e) || (/\bkal\b/.test(e) && direction === 'past')) return { ymd: addDays(ref, -1), kind: 'EXPLICIT' };
  if (/\b(today|tonight|end of (the )?day|eod|aaj|evening)\b/.test(e)) return { ymd: ref, kind: 'EXPLICIT' };

  // ISO 2026-11-12
  if ((m = e.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) {
    const ymd = validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (ymd) return { ymd, kind: 'EXPLICIT' };
  }
  // Indian DMY: 12/11/2026, 12-11-26, 12.11.2026
  if ((m = e.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/))) {
    const ymd = withYear(Number(m[2]), Number(m[1]), m[3], ref, direction);
    if (ymd) return { ymd, kind: 'EXPLICIT' };
  }
  // 12 Nov 2026 / 12th of November
  if ((m = e.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH_RE},?(?: (\\d{4}))?\\b`)))) {
    const ymd = withYear(MONTHS.indexOf(m[2].slice(0, 3)) + 1, Number(m[1]), m[3], ref, direction);
    if (ymd) return { ymd, kind: 'EXPLICIT' };
  }
  // Nov 12, 2026
  if ((m = e.match(new RegExp(`\\b${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)?,?(?: (\\d{4}))?\\b`)))) {
    const ymd = withYear(MONTHS.indexOf(m[1].slice(0, 3)) + 1, Number(m[2]), m[3], ref, direction);
    if (ymd) return { ymd, kind: 'EXPLICIT' };
  }
  // Day of the month only: "on the 5th", "by 25th" -> next such day (or the last one, for past events)
  if ((m = e.match(/\b(?:on |by |before |till |until )?(?:the )?(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const day = Number(m[1]);
    const thisMonth = validYmd(ref.y, ref.m, day);
    const nextMonth = ref.m === 12 ? validYmd(ref.y + 1, 1, day) : validYmd(ref.y, ref.m + 1, day);
    const lastMonth = ref.m === 1 ? validYmd(ref.y - 1, 12, day) : validYmd(ref.y, ref.m - 1, day);
    const ymd = direction === 'future' ? (thisMonth && cmp(thisMonth, ref) >= 0 ? thisMonth : nextMonth) : thisMonth && cmp(thisMonth, ref) <= 0 ? thisMonth : lastMonth;
    if (ymd) return { ymd, kind: 'EXPLICIT' };
  }
  // Ranges: "5-7 business days", "3 to 5 working days" -> upper bound, estimated
  if ((m = e.match(new RegExp(`\\b${NUM} ?(?:-|to|–) ?${NUM} (business |working )?(day|week)s?\\b`)))) {
    const upper = toNum(m[2]);
    if (Number.isFinite(upper)) return { ymd: shift(ref, upper, m[3], m[4]), kind: 'ESTIMATED' };
  }
  // Durations: "within 3 days", "in two weeks", "after 48 hours"
  if ((m = e.match(new RegExp(`\\b(?:within|in|after|next|inside)? ?${NUM} (business |working )?(hour|day|week|month)s?\\b`)))) {
    const n = toNum(m[1]);
    if (Number.isFinite(n)) {
      if (m[3] === 'hour') return { ymd: addDays(ref, Math.ceil(n / 24)), kind: 'ESTIMATED' };
      if (m[3] === 'month') return { ymd: addDays(ref, n * 30), kind: 'ESTIMATED' };
      return { ymd: shift(ref, n, m[2], m[3]), kind: 'ESTIMATED' };
    }
  }
  if (/\bnext week\b/.test(e)) return { ymd: addDays(ref, 7), kind: 'ESTIMATED' };
  if (/\bnext (?:month|cycle)\b/.test(e)) return { ymd: addDays(ref, 30), kind: 'ESTIMATED' };
  if (/\b(end of (the )?week|this week)\b/.test(e)) return { ymd: addDays(ref, (5 - weekday(ref) + 7) % 7), kind: 'ESTIMATED' };
  if (/\b(end of (the )?month|this month)\b/.test(e)) {
    const last = new Date(Date.UTC(ref.y, ref.m, 0)).getUTCDate();
    return { ymd: { y: ref.y, m: ref.m, d: last }, kind: 'ESTIMATED' };
  }
  // Weekdays: "by Friday", "last Monday", "on tue"
  if (
    (m = e.match(
      /\b(?:(last|previous|this|next|coming|by|on|before) )?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?)\b/,
    ))
  ) {
    const target = WEEKDAYS.indexOf(m[2].slice(0, 3));
    const isPast = m[1] === 'last' || m[1] === 'previous' || direction === 'past';
    const today = weekday(ref);
    if (isPast) {
      const back = ((today - target + 7) % 7) || 7;
      return { ymd: addDays(ref, -back), kind: 'EXPLICIT' };
    }
    const fwd = ((target - today + 7) % 7) || 7;
    return { ymd: addDays(ref, fwd), kind: 'EXPLICIT' };
  }
  return null;
}

function shift(ref: YMD, n: number, business: string | undefined, unit: string): YMD {
  if (unit === 'week') return addDays(ref, n * 7);
  return business ? addBusinessDays(ref, n) : addDays(ref, n);
}

/** Future-facing date (deadline): end of business day 18:00 local. */
/** "2 pm", "2 p.m", "10:30 AM", "14:30" -> 24h hour/minute. Null when no time of day is stated. */
export function parseTimeOfDay(expression: string): { hour: number; minute: number } | null {
  const m = expression.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\s|$|[,;!?])/i);
  if (m) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = m[3].toLowerCase().startsWith('p');
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  }
  // Hinglish: "shaam 5 baje" = 5 PM, "subah 10 baje" = 10 AM
  const baje = expression.match(/\b(?:(subah|savere|dopahar|shaam|sham|raat)\s+)?(\d{1,2})\s*baje\b/i);
  if (baje) {
    let hour = Number(baje[2]);
    const part = baje[1]?.toLowerCase();
    if (hour < 1 || hour > 12) return null;
    if ((part && /dopahar|shaam|sham|raat/.test(part) && hour < 12) || (!part && hour >= 1 && hour <= 6)) hour += 12;
    return { hour, minute: 0 };
  }
  const h24 = expression.match(/\b(?:at|by)\s+([01]?\d|2[0-3]):([0-5]\d)\b/i);
  return h24 ? { hour: Number(h24[1]), minute: Number(h24[2]) } : null;
}

/** Future-facing date (deadline/appointment): the stated time, else end of business day 18:00 local. */
export function resolveDeadline(expression: string, reference: Date, timeZone: string): ResolvedDate | null {
  const r = resolveYmd(expression, localDate(reference, timeZone), 'future');
  if (!r) return null;
  const time = parseTimeOfDay(expression);
  return { date: zonedToUtc(r.ymd, time?.hour ?? 18, time?.minute ?? 0, timeZone), kind: r.kind };
}

/** Past-facing date (when something happened): noon local. */
export function resolveEventDate(expression: string, reference: Date, timeZone: string): ResolvedDate | null {
  const r = resolveYmd(expression, localDate(reference, timeZone), 'past');
  return r ? { date: zonedToUtc(r.ymd, 12, 0, timeZone), kind: r.kind } : null;
}

/** LifeLoop's own follow-up suggestion (never a deadline): N days later at 10:00 local. */
export function followUpAfter(days: number, reference: Date, timeZone: string): Date {
  return zonedToUtc(addDays(localDate(reference, timeZone), days), 10, 0, timeZone);
}

export function isDurationExpression(expression: string): boolean {
  return new RegExp(`\\b${NUM} (?:(?:-|to|–) ?${NUM} )?(business |working )?(hour|day|week)s?\\b`).test(expression.toLowerCase());
}

/** Midnight at the start of the user's current local day, as a UTC instant. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  return zonedToUtc(localDate(now, timeZone), 0, 0, timeZone);
}

/** YYYY-MM-DD and hour (0-23) in the user's timezone. */
export function localDayKey(now: Date, timeZone: string): { day: string; hour: number } {
  const ymd = localDate(now, timeZone);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: `${ymd.y}-${pad(ymd.m)}-${pad(ymd.d)}`, hour };
}
