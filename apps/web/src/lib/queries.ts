/** GraphQL documents used by the web app. */

export const CASE_SUMMARY = `
  id title category waitingOn counterpartyName status statusLabel nextAction amountDisplay
  deadlineAt deadlineKind followupAt snoozedUntil resolvedAt updatedAt version
`;

const PROPOSAL = `
  isCommitment classification category lifecycleStage statusLabel lifecycleEvidence title summary waitingOn
  counterparty { value evidence } nextAction { value evidence }
  deadline { at kind expression evidence } amount { amount currency display evidence }
  identifiers { kind value evidence } eventDate { at expression evidence }
  suggestedFollowupAt uncertainties
`;

const CAPTURE = `
  id source status rawText extractedText editedText ocrConfidence note failureCode createdAt
  attachment { id url width height }
`;

export const SUGGESTION = `
  id captureId kind status confidenceScore confidenceBand targetCaseId duplicateOfCaptureId createdAt
  proposed { ${PROPOSAL} }
  confidenceFactors { key label weight value detail }
  candidates { score strength reasons case { ${CASE_SUMMARY} } }
  targetCase { ${CASE_SUMMARY} }
`;

export const ME = `query Me { me { id email displayName timezone emailVerified hasPassword } }`;

export const DASHBOARD = `query Dashboard {
  dashboard {
    pendingSuggestions openCases resolvedCases
    needsAction { ${CASE_SUMMARY} }
    waitingOnOthers { ${CASE_SUMMARY} }
    followUpDue { ${CASE_SUMMARY} }
    recentlyResolved { ${CASE_SUMMARY} }
  }
}`;

export const CAPTURES = `query Captures { captures(limit: 20) { ${CAPTURE} suggestion { id kind status confidenceBand proposed { title } } } }`;

export const CAPTURE_DETAIL = `query Capture($id: ID!) { capture(id: $id) { ${CAPTURE} suggestion { ${SUGGESTION} } } }`;

export const CREATE_TEXT_CAPTURE = `mutation CreateText($input: CreateTextCaptureInput!) { createTextCapture(input: $input) { id status } }`;
export const CREATE_SCREENSHOT_CAPTURE = `mutation CreateShot($input: CreateScreenshotCaptureInput!) { createScreenshotCapture(input: $input) { id status } }`;
export const REPROCESS_CAPTURE = `mutation Reprocess($id: ID!, $text: String!) { reprocessCapture(id: $id, editedText: $text) { id status } }`;
export const RETRY_CAPTURE = `mutation Retry($id: ID!) { retryCapture(id: $id) { id status } }`;

export const SUGGESTIONS = `query Suggestions { suggestions { ${SUGGESTION} capture { ${CAPTURE} } } }`;

export const APPROVE = `mutation Approve($id: ID!, $edits: SuggestionEditsInput, $resolveCase: Boolean, $forceNew: Boolean) {
  approveSuggestion(id: $id, edits: $edits, resolveCase: $resolveCase, forceNew: $forceNew) { suggestion { id status } case { id } }
}`;
export const ATTACH = `mutation Attach($id: ID!, $caseId: ID!, $resolveCase: Boolean) {
  attachSuggestionToCase(id: $id, caseId: $caseId, resolveCase: $resolveCase) { suggestion { id status } case { id } }
}`;
export const REJECT = `mutation Reject($id: ID!, $reason: String) { rejectSuggestion(id: $id, reason: $reason) { suggestion { id status } } }`;

export const CASES = `query Cases($filter: CaseFilterInput) { cases(filter: $filter) { ${CASE_SUMMARY} } }`;

export const CASE_DETAIL = `query Case($id: ID!) {
  case(id: $id) {
    ${CASE_SUMMARY} description commitmentType currency amount deadlineEvidence createdAt
    identifiers { kind value }
    events { id type actor note summary captureId createdAt }
    captures { ${CAPTURE} }
  }
}`;

export const CREATE_CASE = `mutation CreateCase($input: CreateCaseInput!) { createCase(input: $input) { id } }`;
export const UPDATE_CASE = `mutation UpdateCase($id: ID!, $input: UpdateCaseInput!, $version: Int!) { updateCase(id: $id, input: $input, version: $version) { id version } }`;
export const CHANGE_STATUS = `mutation ChangeStatus($id: ID!, $status: String!, $note: String) { changeCaseStatus(id: $id, status: $status, note: $note) { id status } }`;
export const SNOOZE = `mutation Snooze($id: ID!, $until: DateTime!) { snoozeCase(id: $id, until: $until) { id status } }`;
export const ADD_NOTE = `mutation AddNote($caseId: ID!, $note: String!) { addCaseNote(caseId: $caseId, note: $note) { id } }`;
export const LOG_FOLLOW_UP = `mutation LogFollowUp($caseId: ID!, $note: String, $next: DateTime) { logFollowUp(caseId: $caseId, note: $note, nextFollowupAt: $next) { id } }`;

export const NOTIFICATIONS = `query Notifications { unreadNotificationCount notifications(limit: 20) { id kind title body caseId read emailed createdAt } }`;
export const MARK_READ = `mutation MarkRead($ids: [ID!]) { markNotificationsRead(ids: $ids) }`;
export const SETTINGS = `query Settings { me { id email displayName timezone emailNotifications digestEnabled digestHour emailDelivery googleEmail hasPassword emailVerified } }`;
export const UPDATE_SETTINGS = `mutation UpdateSettings($input: NotificationSettingsInput!) { updateNotificationSettings(input: $input) { id emailNotifications digestEnabled digestHour } }`;
export const SEND_TEST_EMAIL = `mutation { sendTestEmail }`;
export const DISCONNECT_GOOGLE = `mutation { disconnectGoogle { id googleEmail } }`;
