export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  emailVerified?: boolean;
  hasPassword?: boolean;
}

export interface Evidenced {
  value: string;
  evidence: string | null;
}

export interface Proposal {
  isCommitment: boolean;
  classification: string;
  category: string | null;
  lifecycleStage: string | null;
  statusLabel: string | null;
  lifecycleEvidence: string | null;
  title: string;
  summary: string | null;
  waitingOn: string;
  counterparty: Evidenced | null;
  nextAction: Evidenced | null;
  deadline: { at: string; kind: string; expression: string; evidence: string } | null;
  amount: { amount: number; currency: string | null; display: string; evidence: string } | null;
  identifiers: Array<{ kind: string; value: string; evidence: string }>;
  eventDate: { at: string; expression: string; evidence: string } | null;
  suggestedFollowupAt: string | null;
  uncertainties: string[];
}

export interface CaseSummary {
  id: string;
  title: string;
  category: string;
  waitingOn: string;
  counterpartyName: string | null;
  status: string;
  statusLabel: string | null;
  nextAction: string | null;
  amountDisplay: string | null;
  deadlineAt: string | null;
  deadlineKind: string;
  followupAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface CaseEvent {
  id: string;
  type: string;
  actor: string;
  note: string | null;
  summary: string | null;
  captureId: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface Capture {
  id: string;
  source: string;
  status: string;
  rawText: string | null;
  extractedText: string | null;
  editedText: string | null;
  ocrConfidence: number | null;
  note: string | null;
  failureCode: string | null;
  attachment: Attachment | null;
  createdAt: string;
}

export interface ConfidenceFactor {
  key: string;
  label: string;
  weight: number;
  value: number;
  detail: string;
}

export interface MatchCandidate {
  case: CaseSummary;
  score: number;
  strength: string;
  reasons: string[];
}

export interface Suggestion {
  id: string;
  captureId: string;
  kind: 'NEW_CASE' | 'UPDATE_CASE' | 'DUPLICATE' | 'NOT_ACTIONABLE';
  status: string;
  proposed: Proposal;
  confidenceScore: number;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceFactors: ConfidenceFactor[];
  targetCaseId: string | null;
  duplicateOfCaptureId: string | null;
  createdAt: string;
  candidates: MatchCandidate[];
  targetCase: CaseSummary | null;
  capture?: Capture;
}

export interface CaseDetail extends CaseSummary {
  description: string | null;
  commitmentType: string;
  currency: string | null;
  amount: number | null;
  deadlineEvidence: string | null;
  createdAt: string;
  identifiers: Array<{ kind: string; value: string }>;
  events: CaseEvent[];
  captures: Capture[];
}

export interface Dashboard {
  needsAction: CaseSummary[];
  waitingOnOthers: CaseSummary[];
  followUpDue: CaseSummary[];
  recentlyResolved: CaseSummary[];
  pendingSuggestions: number;
  openCases: number;
  resolvedCases: number;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  caseId: string | null;
  read: boolean;
  emailed: boolean;
  createdAt: string;
}

export interface Settings extends User {
  emailNotifications: boolean;
  digestEnabled: boolean;
  digestHour: number;
  emailDelivery: 'console' | 'smtp';
  googleEmail: string | null;
  hasPassword: boolean;
  emailVerified: boolean;
}
