import { CATEGORIES, WAITING_ON } from '../extraction/extraction.schema.js';

export const CASE_STATUSES = ['OPEN', 'SNOOZED', 'RESOLVED', 'CLOSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Allowed status transitions. Anything else is rejected. */
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ['SNOOZED', 'RESOLVED', 'CLOSED'],
  SNOOZED: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN'],
  CLOSED: ['OPEN'],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as CaseStatus] ?? []).includes(to as CaseStatus);
}

export const isCaseStatus = (s: string): s is CaseStatus => (CASE_STATUSES as readonly string[]).includes(s);
export const isCategory = (s: string) => (CATEGORIES as readonly string[]).includes(s);
export const isWaitingOn = (s: string) => (WAITING_ON as readonly string[]).includes(s);

export const STAGE_LABELS: Record<string, string> = {
  REFUND_INITIATED: 'Refund initiated',
  REFUND_COMPLETED: 'Refund completed',
  PAYMENT_SUCCESS: 'Payment successful',
  PAYMENT_PENDING: 'Payment pending',
  PAYMENT_FAILED: 'Payment failed',
  DOC_TO_SUBMIT: 'Document to submit',
  DOC_AWAITED: 'Waiting for document',
  REQUEST_SUBMITTED: 'Request submitted',
  REQUEST_RESOLVED: 'Request resolved',
  APPOINTMENT_SCHEDULED: 'Appointment scheduled',
  DELIVERY_PENDING: 'Delivery pending',
  DELIVERED: 'Delivered',
};

export function commitmentTypeFor(classification: string): string {
  return ['PENDING_ACTION', 'WAITING_RESPONSE', 'WAITING_PAYMENT', 'APPOINTMENT'].includes(classification)
    ? classification
    : 'WAITING_RESPONSE';
}
