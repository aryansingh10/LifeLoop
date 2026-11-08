import { z } from 'zod';

/**
 * Contract between any AI provider and LifeLoop (schema_version 1).
 * The model returns *expressions* and *evidence*; application code resolves dates and amounts
 * and verifies that every evidence quote really appears in the user's input.
 */
export const CLASSIFICATIONS = [
  'PENDING_ACTION',
  'WAITING_RESPONSE',
  'WAITING_PAYMENT',
  'APPOINTMENT',
  'INFORMATIONAL',
  'COMPLETED',
  'UNCERTAIN',
] as const;

export const CATEGORIES = [
  'REFUND',
  'PAYMENT',
  'REPAIR',
  'DELIVERY',
  'APPOINTMENT',
  'SERVICE_REQUEST',
  'DOCUMENT',
  'REIMBURSEMENT',
  'PERSONAL_PROMISE',
  'OTHER',
] as const;

export const LIFECYCLE_STAGES = [
  'REFUND_INITIATED',
  'REFUND_COMPLETED',
  'PAYMENT_SUCCESS',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'DOC_TO_SUBMIT',
  'DOC_AWAITED',
  'REQUEST_SUBMITTED',
  'REQUEST_RESOLVED',
  'APPOINTMENT_SCHEDULED',
  'DELIVERY_PENDING',
  'DELIVERED',
  'OTHER',
] as const;

export const WAITING_ON = ['USER', 'OTHER_PARTY', 'UNKNOWN'] as const;
export const IDENTIFIER_KINDS = ['ORDER_ID', 'REFERENCE', 'TICKET', 'TRANSACTION_ID', 'OTHER'] as const;

/** Stages that mean the commitment is fulfilled. */
export const COMPLETED_STAGES = new Set<string>(['REFUND_COMPLETED', 'PAYMENT_SUCCESS', 'REQUEST_RESOLVED', 'DELIVERED']);

const evidence = z.string().min(1).max(500).describe('Exact quote copied from the input that supports this value');

export const ExtractionSchema = z.object({
  isCommitment: z.boolean().describe('True only if the input describes something still pending or upcoming'),
  classification: z.enum(CLASSIFICATIONS),
  category: z.enum(CATEGORIES).nullable(),
  lifecycleStage: z.enum(LIFECYCLE_STAGES).nullable(),
  lifecycleEvidence: evidence.nullable(),
  title: z.string().min(1).max(120).describe('Short title, e.g. "Amazon refund ₹2,499"'),
  summary: z.string().max(500).nullable(),
  waitingOn: z.enum(WAITING_ON),
  counterparty: z.object({ name: z.string().min(1).max(200), evidence }).nullable(),
  nextAction: z.object({ text: z.string().min(1).max(300), evidence: evidence.nullable() }).nullable(),
  deadline: z
    .object({
      expression: z.string().min(1).max(200).describe('The date/time phrase as written, e.g. "within 3 days"'),
      kind: z.enum(['EXPLICIT', 'ESTIMATED']),
      evidence,
    })
    .nullable(),
  amount: z
    .object({
      value: z.string().min(1).max(40).describe('Number as written, e.g. "2,499"'),
      currency: z.string().max(3).nullable(),
      evidence,
    })
    .nullable(),
  identifiers: z.array(z.object({ kind: z.enum(IDENTIFIER_KINDS), value: z.string().min(1).max(120), evidence })).max(10),
  eventDate: z.object({ expression: z.string().min(1).max(200), evidence }).nullable(),
  uncertainties: z.array(z.string().max(300)).max(10),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Classification = (typeof CLASSIFICATIONS)[number];
export type Category = (typeof CATEGORIES)[number];
export type WaitingOn = (typeof WAITING_ON)[number];
