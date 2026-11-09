import { Field, Float, GraphQLISODateTime, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

/**
 * GraphQL types (code-first). Enum-like values are exposed as strings; their allowed values are
 * validated in the service layer. Internal fields (provider, raw model output, costs) are never exposed.
 */

@ObjectType()
export class User {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field() displayName: string;
  @Field() timezone: string;
  @Field() defaultCurrency: string;
  @Field() emailNotifications: boolean;
  @Field() digestEnabled: boolean;
  @Field(() => Int, { description: 'Local hour (0-23) for the morning digest' }) digestHour: number;
  @Field({ description: 'console (emails printed by the API) or smtp (real email)' }) emailDelivery: string;
  @Field(() => String, { nullable: true, description: 'Google account linked for sign-in, if any' }) googleEmail: string | null;
  @Field() hasPassword: boolean;
  @Field() emailVerified: boolean;
}

@ObjectType()
export class Notification {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field() title: string;
  @Field() body: string;
  @Field(() => ID, { nullable: true }) caseId: string | null;
  @Field() read: boolean;
  @Field() emailed: boolean;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class Evidenced {
  @Field() value: string;
  @Field(() => String, { nullable: true }) evidence: string | null;
}

@ObjectType()
export class ProposedDeadline {
  @Field(() => GraphQLISODateTime) at: Date;
  @Field({ description: 'EXPLICIT (stated date) or ESTIMATED (worked out from a range/duration)' }) kind: string;
  @Field() expression: string;
  @Field() evidence: string;
}

@ObjectType()
export class ProposedAmount {
  @Field(() => Float) amount: number;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field() display: string;
  @Field() evidence: string;
}

@ObjectType()
export class ProposedIdentifier {
  @Field() kind: string;
  @Field() value: string;
  @Field() evidence: string;
}

@ObjectType()
export class ProposedEventDate {
  @Field(() => GraphQLISODateTime) at: Date;
  @Field() expression: string;
  @Field() evidence: string;
}

@ObjectType()
export class Proposal {
  @Field() isCommitment: boolean;
  @Field() classification: string;
  @Field(() => String, { nullable: true }) category: string | null;
  @Field(() => String, { nullable: true }) lifecycleStage: string | null;
  @Field(() => String, { nullable: true }) statusLabel: string | null;
  @Field(() => String, { nullable: true }) lifecycleEvidence: string | null;
  @Field() title: string;
  @Field(() => String, { nullable: true }) summary: string | null;
  @Field() waitingOn: string;
  @Field(() => Evidenced, { nullable: true }) counterparty: Evidenced | null;
  @Field(() => Evidenced, { nullable: true }) nextAction: Evidenced | null;
  @Field(() => ProposedDeadline, { nullable: true }) deadline: ProposedDeadline | null;
  @Field(() => ProposedAmount, { nullable: true }) amount: ProposedAmount | null;
  @Field(() => [ProposedIdentifier]) identifiers: ProposedIdentifier[];
  @Field(() => ProposedEventDate, { nullable: true }) eventDate: ProposedEventDate | null;
  @Field(() => GraphQLISODateTime, { nullable: true, description: "LifeLoop's suggested follow-up date (not a deadline)" })
  suggestedFollowupAt: Date | null;
  @Field(() => [String]) uncertainties: string[];
}

@ObjectType()
export class ConfidenceFactor {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Float) weight: number;
  @Field(() => Float) value: number;
  @Field() detail: string;
}

@ObjectType()
export class CaseIdentifier {
  @Field() kind: string;
  @Field() value: string;
}

@ObjectType()
export class Attachment {
  @Field(() => ID) id: string;
  @Field() mimeType: string;
  @Field(() => Int) sizeBytes: number;
  @Field(() => Int, { nullable: true }) width: number | null;
  @Field(() => Int, { nullable: true }) height: number | null;
  @Field() url: string;
}

@ObjectType()
export class Capture {
  @Field(() => ID) id: string;
  @Field() source: string;
  @Field({ description: 'RECEIVED | PREPROCESSING | EXTRACTING | NEEDS_REVIEW | NO_COMMITMENT | DUPLICATE | FAILED' })
  status: string;
  @Field(() => String, { nullable: true }) rawText: string | null;
  @Field(() => String, { nullable: true, description: 'Typed text, or text recognized from a screenshot' })
  extractedText: string | null;
  @Field(() => String, { nullable: true }) editedText: string | null;
  @Field(() => Float, { nullable: true }) ocrConfidence: number | null;
  @Field(() => String, { nullable: true }) note: string | null;
  @Field(() => String, { nullable: true }) failureCode: string | null;
  @Field(() => Attachment, { nullable: true }) attachment: Attachment | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  // resolved fields: suggestion
}

@ObjectType()
export class CaseEvent {
  @Field(() => ID) id: string;
  @Field() type: string;
  @Field() actor: string;
  @Field(() => String, { nullable: true }) note: string | null;
  @Field(() => String, { nullable: true, description: 'Human-readable summary of what changed' }) summary: string | null;
  @Field(() => ID, { nullable: true }) captureId: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class Case {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field() category: string;
  @Field() commitmentType: string;
  @Field() waitingOn: string;
  @Field(() => String, { nullable: true }) counterpartyName: string | null;
  @Field() status: string;
  @Field(() => String, { nullable: true }) statusLabel: string | null;
  @Field(() => String, { nullable: true }) nextAction: string | null;
  @Field(() => Float, { nullable: true }) amount: number | null;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) amountDisplay: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) deadlineAt: Date | null;
  @Field() deadlineKind: string;
  @Field(() => String, { nullable: true }) deadlineEvidence: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) followupAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) snoozedUntil: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) resolvedAt: Date | null;
  @Field(() => Int) version: number;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
  // resolved fields: identifiers, events, captures
}

@ObjectType()
export class MatchCandidate {
  @Field(() => Case) case: Case;
  @Field(() => Float) score: number;
  @Field() strength: string;
  @Field(() => [String]) reasons: string[];
}

@ObjectType()
export class Suggestion {
  @Field(() => ID) id: string;
  @Field(() => ID) captureId: string;
  @Field({ description: 'NEW_CASE | UPDATE_CASE | DUPLICATE | NOT_ACTIONABLE' }) kind: string;
  @Field() status: string;
  @Field(() => Proposal) proposed: Proposal;
  @Field(() => Float) confidenceScore: number;
  @Field({ description: 'HIGH | MEDIUM | LOW (heuristic, not a probability)' }) confidenceBand: string;
  @Field(() => [ConfidenceFactor]) confidenceFactors: ConfidenceFactor[];
  @Field(() => ID, { nullable: true }) targetCaseId: string | null;
  @Field(() => ID, { nullable: true }) duplicateOfCaptureId: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  // resolved fields: candidates, targetCase, capture
}

@ObjectType()
export class ReviewResult {
  @Field(() => Suggestion) suggestion: Suggestion;
  @Field(() => Case, { nullable: true }) case: Case | null;
}

@ObjectType()
export class Dashboard {
  @Field(() => [Case]) needsAction: Case[];
  @Field(() => [Case]) waitingOnOthers: Case[];
  @Field(() => [Case]) followUpDue: Case[];
  @Field(() => [Case]) recentlyResolved: Case[];
  @Field(() => Int) pendingSuggestions: number;
  @Field(() => Int) openCases: number;
  @Field(() => Int) resolvedCases: number;
}

// ------------------------------------------------------------------ inputs

@InputType()
export class CreateTextCaptureInput {
  @Field() text: string;
  @Field({ defaultValue: 'TEXT', description: 'TEXT or PASTE' }) source: string;
  @Field(() => ID, { description: 'Client-generated UUID; makes retries idempotent' }) clientRequestId: string;
}

@InputType()
export class CreateScreenshotCaptureInput {
  @Field(() => ID) attachmentId: string;
  @Field(() => ID) clientRequestId: string;
  @Field(() => String, { nullable: true }) note?: string | null;
}

@InputType()
export class SuggestionEditsInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) category?: string | null;
  @Field(() => String, { nullable: true }) waitingOn?: string | null;
  @Field(() => String, { nullable: true }) counterpartyName?: string | null;
  @Field(() => String, { nullable: true, description: 'e.g. "2499" or "2,499.50"; empty string clears' }) amount?: string | null;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => String, { nullable: true }) nextAction?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) deadlineAt?: Date | null;
  @Field({ nullable: true, description: 'Set true to remove the proposed deadline' }) clearDeadline?: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) followupAt?: Date | null;
  @Field({ nullable: true }) clearFollowup?: boolean;
}

@InputType()
export class UpdateCaseInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) category?: string | null;
  @Field(() => String, { nullable: true }) waitingOn?: string | null;
  @Field(() => String, { nullable: true }) counterpartyName?: string | null;
  @Field(() => String, { nullable: true }) statusLabel?: string | null;
  @Field(() => String, { nullable: true }) nextAction?: string | null;
  @Field(() => String, { nullable: true }) amount?: string | null;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) deadlineAt?: Date | null;
  @Field({ nullable: true }) clearDeadline?: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) followupAt?: Date | null;
  @Field({ nullable: true }) clearFollowup?: boolean;
}

@InputType()
export class CreateCaseInput {
  @Field() title: string;
  @Field({ defaultValue: 'OTHER' }) category: string;
  @Field({ defaultValue: 'OTHER_PARTY' }) waitingOn: string;
  @Field(() => String, { nullable: true }) counterpartyName?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) nextAction?: string | null;
  @Field(() => String, { nullable: true }) amount?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) deadlineAt?: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) followupAt?: Date | null;
}

@InputType()
export class CaseFilterInput {
  @Field(() => [String], { nullable: true, description: 'Defaults to OPEN and SNOOZED' }) statuses?: string[] | null;
  @Field(() => String, { nullable: true }) waitingOn?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true }) displayName?: string | null;
  @Field(() => String, { nullable: true }) timezone?: string | null;
}

@InputType()
export class NotificationSettingsInput {
  @Field({ nullable: true }) emailNotifications?: boolean;
  @Field({ nullable: true }) digestEnabled?: boolean;
  @Field(() => Int, { nullable: true }) digestHour?: number;
}
