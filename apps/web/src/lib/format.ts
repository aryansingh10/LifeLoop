const DAY = 24 * 3600 * 1000;

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const target = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(target) - start(new Date())) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatDate(iso);
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

export const CATEGORY_LABELS: Record<string, string> = {
  REFUND: 'Refund',
  PAYMENT: 'Payment',
  REPAIR: 'Repair',
  DELIVERY: 'Delivery',
  APPOINTMENT: 'Appointment',
  SERVICE_REQUEST: 'Service request',
  DOCUMENT: 'Document',
  REIMBURSEMENT: 'Reimbursement',
  PERSONAL_PROMISE: 'Promise',
  OTHER: 'Other',
};

export const WAITING_ON_LABELS: Record<string, string> = {
  USER: 'You need to act',
  OTHER_PARTY: 'Waiting on them',
  UNKNOWN: 'Not sure who',
};

export const BAND_LABELS: Record<string, string> = { HIGH: 'Looks clear', MEDIUM: 'Please check', LOW: 'Unsure' };

/** Converts an ISO instant to the value format of <input type="date">. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** <input type="date"> value -> ISO at 10:00 local (follow-ups) or 18:00 (deadlines). */
export function fromDateInput(value: string, hour = 10): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0).toISOString();
}

export const FAILURE_MESSAGES: Record<string, string> = {
  NO_TEXT_FOUND: "We couldn't find any text in this image.",
  AI_OUTPUT_INVALID: "We couldn't understand this one. Try rewording it.",
  EXTRACTION_FAILED: 'Processing failed. Please retry.',
  OCR_FAILED: "We couldn't read this image. Please retry.",
  NO_SPEECH_FOUND: "We couldn't hear any speech in this voice note. Try recording again closer to the microphone.",
  TRANSCRIBE_FAILED: "We couldn't transcribe this voice note. Please retry.",
};

/** Today's date as an <input type="date"> value: the earliest allowed reminder date. */
export function todayInput(): string {
  return toDateInput(new Date().toISOString());
}
