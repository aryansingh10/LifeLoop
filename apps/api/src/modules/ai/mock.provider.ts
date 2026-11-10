import type { Category, Classification, Extraction, WaitingOn } from '../extraction/extraction.schema.js';
import type { AiProvider, ExtractionRequest, ExtractionResponse } from './ai-provider.js';

/**
 * Offline, deterministic, rule-based extractor. Lets the whole product run with no API key and
 * gives tests stable output. It follows the same contract as the real model: values come with
 * verbatim evidence quotes and dates are returned as expressions.
 */
interface Hit {
  text: string;
  index: number;
  groups: string[];
}

function find(source: string, re: RegExp): Hit | null {
  const m = re.exec(source);
  return m ? { text: m[0], index: m.index, groups: m.slice(1).map((g) => g ?? '') } : null;
}

function findAll(source: string, re: RegExp): Hit[] {
  const out: Hit[] = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of source.matchAll(g)) out.push({ text: m[0], index: m.index ?? 0, groups: m.slice(1).map((x) => x ?? '') });
  return out;
}

const KNOWN_COUNTERPARTIES = [
  'Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Swiggy', 'Zomato', 'Blinkit', 'Zepto', 'BigBasket',
  'Uber', 'Ola', 'Rapido', 'IRCTC', 'MakeMyTrip', 'Goibibo', 'IndiGo', 'Air India', 'Vistara', 'Airtel', 'Jio', 'Vi',
  'BSNL', 'Tata Play', 'HDFC', 'ICICI', 'SBI', 'Axis Bank', 'Kotak', 'Paytm', 'PhonePe', 'Google Pay', 'GPay',
  'Samsung', 'Apple', 'OnePlus', 'Xiaomi', 'Dell', 'HP', 'Lenovo', 'Croma', 'Reliance Digital', 'Urban Company',
  'LIC', 'Bajaj', 'Decathlon', 'IKEA', 'Netflix', 'Hotstar', 'Spotify',
];

const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ['REFUND', /\brefund(?:ed|s)?\b|\bpaisa wapas\b/i],
  ['REIMBURSEMENT', /\breimburse(?:ment|d)?\b/i],
  ['REPAIR', /\b(repair(?:ed|ing)?|technician|service cent(?:er|re)|mechanic|servicing)\b/i],
  ['DELIVERY', /\b(deliver(?:y|ed)?|shipped|out for delivery|dispatched|courier|parcel)\b/i],
  ['APPOINTMENT', /\b(appointment|consultation|booked for|scheduled (?:for|on))\b/i],
  ['PAYMENT', /\b(payment|paid|transaction|upi|emi|invoice|salary|bill)\b/i],
  ['DOCUMENT', /\b(document|certificate|pan card|aadhaa?r|marksheet|kyc|form)\b/i],
  ['SERVICE_REQUEST', /\b(ticket|complaint|service request|request (?:no|number|id)|sr (?:no|number))\b/i],
  ['PERSONAL_PROMISE', /\b(promised|will send|will share|will get back|said (?:he|she|they) would)\b/i],
];

const INFORMATIONAL = /\b(otp|one[- ]time password|verification code|\d+% off|flat \d+%|sale|offer ends|newsletter|unsubscribe|congratulations|you have won)\b/i;
const PENDING = /\b(not (?:yet )?(?:received|credited|arrived|reflected|delivered|resolved)|haven'?t|hasn'?t|yet to|pending|awaiting|waiting|will (?:call|send|share|visit|come|reach|update|get back|be (?:credited|delivered|processed|refunded|resolved))|promised|initiated|submitted|raised|registered|scheduled|expected|may take|need to|have to|must|please (?:submit|upload|send|provide|share)|due|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili|hua|hui)|aane wala|aane wali|aayega|aayegi)\b/i;
const NOT_YET = /\b(not (?:yet )?(?:received|credited|arrived|reflected|delivered|resolved)|haven'?t|hasn'?t|yet to|still|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili|hua|hui))\b/i;
/** 2-7 digit amounts, optionally grouped (1,00,000 / 12,500) or with paise; avoids long IDs. */
const MONEY_NUMBER = '(?:\\d{1,3}(?:,\\d{2,3})+|\\d{2,7})(?:\\.\\d{1,2})?';
const MONEY_WORDS = 'refund|refunded|payment|paid|cashback|bill|amount|reimbursement|deposit|fees?|salary|emi|charges?|paise|paisa|rupaye|rupay';
const USER_ACTION = /\b(?:i |you )?(?:need to|have to|must|please|kindly) (submit|upload|send|provide|share|pay|complete|sign|bring)\b[^.\n]{0,60}/i;

const NUMBER_WORD = '(?:\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)';
const TIME_OF_DAY = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
const DAY_WORD = '(?:day after tomorrow|tomorrow|today|tonight|(?:on |this |next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))';
const DEADLINE_RULES: Array<[RegExp, 'EXPLICIT' | 'ESTIMATED']> = [
  // "at 2 p.m tomorrow", "tomorrow at 2pm", "on Friday at 10:30 am"
  [new RegExp(`\\b(?:at |by )?${TIME_OF_DAY}\\s+(?:on\\s+)?${DAY_WORD}\\b|\\b${DAY_WORD}\\s+(?:at |by )?${TIME_OF_DAY}`, 'i'), 'EXPLICIT'],
  [new RegExp(`\\b${NUMBER_WORD} ?(?:-|to|–) ?${NUMBER_WORD} (?:business |working )?days?\\b`, 'i'), 'ESTIMATED'],
  [new RegExp(`\\b(?:within|in|next) ${NUMBER_WORD} (?:business |working )?(?:days?|hours?|weeks?)\\b`, 'i'), 'ESTIMATED'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, 'EXPLICIT'],
  [/\b\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?: \d{4})?\b/i, 'EXPLICIT'],
  [/\b(?:by|before|on|this|next|coming) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, 'EXPLICIT'],
  [/\b(?:day after tomorrow|tomorrow|by end of day|by eod|tonight)\b/i, 'EXPLICIT'],
];
const EVENT_RULE = /\b(day before yesterday|yesterday|last (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i;

const NOUNS: Record<Category, string> = {
  REFUND: 'refund',
  PAYMENT: 'payment',
  REPAIR: 'repair',
  DELIVERY: 'delivery',
  APPOINTMENT: 'appointment',
  SERVICE_REQUEST: 'service request',
  DOCUMENT: 'document',
  REIMBURSEMENT: 'reimbursement',
  PERSONAL_PROMISE: 'promise',
  OTHER: 'item',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words that end a name ("Dr Sharma at 5pm", "Rahul ne bola"). */
const NAME_STOP = new Set([
  'at', 'on', 'in', 'for', 'from', 'to', 'with', 'and', 'or', 'about', 'regarding', 'by', 'the', 'is', 'was', 'has', 'have', 'will', 'would',
  'said', 'told', 'promised', 'today', 'tomorrow', 'tonight', 'yesterday', 'ki', 'ka', 'ke', 'ko', 'se', 'ne', 'ji', 'sir', 'madam', 'clinic', 'hospital',
]);
/** Capitalised words that are not names. */
const NOT_A_NAME = new Set([
  'I', 'The', 'My', 'Your', 'Our', 'Their', 'His', 'Her', 'He', 'She', 'They', 'We', 'You', 'It', 'This', 'That', 'Today', 'Tomorrow', 'Yesterday',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December', 'Customer', 'Support', 'Team', 'Dear', 'Hi', 'Hello', 'Please', 'Thanks', 'Thank',
  'Refund', 'Order', 'Payment', 'Ticket', 'Bank', 'Mom', 'Dad',
]);
const TITLES = '(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Prof|Professor|Adv|Advocate|Shri|Smt|Sri)';

/**
 * A person the user deals with, quoted verbatim as evidence:
 *   "appointment with Dr. Vivek Gupta", "Rahul said he will send…", "waiting for a call from Priya Sharma".
 */
function findPerson(source: string): Extraction['counterparty'] {
  // 1) Honorific + up to three words (works for lowercase too: "dr sharma").
  const titled = find(source, new RegExp(`\\b${TITLES}\\b\\.?\\s+([A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*){0,2})`, 'i'));
  if (titled) {
    const words = titled.groups[0].split(/\s+/);
    const kept: string[] = [];
    for (const w of words) {
      if (NAME_STOP.has(w.toLowerCase())) break;
      kept.push(w);
    }
    if (kept.length) {
      const titleText = titled.text.slice(0, titled.text.length - titled.groups[0].length).trimEnd();
      const evidence = `${titleText} ${kept.join(' ')}`.replace(/\s+/g, ' ');
      if (source.includes(evidence)) {
        const pretty = `${cap(titleText.toLowerCase().replace(/^doctor/, 'dr'))} ${kept.map((w) => cap(w)).join(' ')}`;
        return { name: pretty.replace(/^(Dr|Mr|Mrs|Ms|Prof)(?!\.) /, '$1. '), evidence };
      }
    }
  }
  // 2) "Rahul said / promised / told me / will send…"
  const speaker = find(source, /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:said|promised|told|will (?:send|call|share|pay|return|come|visit)|has promised|ne (?:bola|kaha))\b/);
  if (speaker && !NOT_A_NAME.has(speaker.groups[0].split(' ')[0])) return { name: speaker.groups[0], evidence: speaker.groups[0] };
  // 3) "with / from / by Priya Sharma" (capitalised names only, to avoid ordinary words)
  for (const hit of findAll(source, /\b(?:with|from|by)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\b/g)) {
    const words = hit.groups[0].split(' ').filter((w) => !NOT_A_NAME.has(w));
    if (words.length && words.length === hit.groups[0].split(' ').length) return { name: hit.groups[0], evidence: hit.groups[0] };
  }
  return null;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function mockExtract(text: string): Extraction {
  const uncertainties: string[] = [];

  let category: Category | null = null;
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(text)) {
      category = cat;
      break;
    }
  }

  // Counterparty
  let counterparty: Extraction['counterparty'] = null;
  for (const name of KNOWN_COUNTERPARTIES) {
    const hit = find(text, new RegExp(`\\b${escapeRe(name)}(?:\\.in|\\.com)?\\b`, 'i'));
    if (hit) {
      counterparty = { name, evidence: hit.text };
      break;
    }
  }
  if (!counterparty) {
    const hit = find(text, /\b([A-Z][A-Za-z&]+(?: [A-Z][A-Za-z&]+)?) (service cent(?:er|re)|customer care|support team|bank|hospital|clinic)\b/);
    if (hit) counterparty = { name: hit.text, evidence: hit.text };
  }
  let counterpartyIsPerson = false;
  if (!counterparty) {
    counterparty = findPerson(text);
    counterpartyIsPerson = counterparty !== null;
  }

  // Amount
  let amount: Extraction['amount'] = null;
  const amountHit =
    find(text, /(₹|\brs\.?|\binr\b)\s?([\d,]+(?:\.\d{1,2})?)/i) ?? find(text, /\b([\d,]+(?:\.\d{1,2})?)\s?(rupees|rs\.?|inr)\b/i);
  if (amountHit) {
    const value = /\d/.test(amountHit.groups[1]) ? amountHit.groups[1] : amountHit.groups[0];
    amount = { value, currency: 'INR', evidence: amountHit.text };
  } else {
    // A bare number right next to a money word: "500 ka refund", "refund of 1,200", "payment 750".
    // No currency is written, so none is claimed (validation adds "Currency not stated").
    const bare =
      find(text, new RegExp(`\\b(${MONEY_NUMBER})\\s+(?:(?:ka|ki|ke|of|worth|wala|wali)\\s+){0,2}(?:${MONEY_WORDS})\\b`, 'i')) ??
      find(text, new RegExp(`\\b(?:${MONEY_WORDS})\\s+(?:(?:of|ka|ki|ke|amount|for)\\s+){0,2}(${MONEY_NUMBER})\\b(?!\\s*(?:days?|din|hours?|weeks?|%))`, 'i'));
    if (bare) amount = { value: bare.groups[0], currency: null, evidence: bare.text };
  }

  // Identifiers
  const identifiers: Extraction['identifiers'] = [];
  for (const hit of findAll(
    text,
    /\b(order|ref(?:erence)?|ticket|complaint|sr|service request|request|transaction|txn|utr|awb|tracking)\s*(?:id|no\.?|number|#)?\s*(?:is\s*)?[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/gi,
  )) {
    const value = hit.groups[1];
    if (!/\d/.test(value)) continue;
    const label = hit.groups[0].toLowerCase();
    const kind = label.startsWith('order')
      ? 'ORDER_ID'
      : /^(transaction|txn|utr)/.test(label)
        ? 'TRANSACTION_ID'
        : /^ref/.test(label)
          ? 'REFERENCE'
          : /^(awb|tracking)/.test(label)
            ? 'OTHER'
            : 'TICKET';
    identifiers.push({ kind, value, evidence: hit.text });
  }

  // Lifecycle stage
  let lifecycleStage: Extraction['lifecycleStage'] = null;
  let lifecycleEvidence: string | null = null;
  const stage = (s: NonNullable<Extraction['lifecycleStage']>, re: RegExp): boolean => {
    const hit = find(text, re);
    if (hit && !lifecycleStage) {
      lifecycleStage = s;
      lifecycleEvidence = hit.text;
      return true;
    }
    return false;
  };
  const notYet = NOT_YET.test(text);
  switch (category) {
    case 'REFUND':
    case 'REIMBURSEMENT':
      if (!notYet) stage('REFUND_COMPLETED', /\b(?:successfully (?:refunded|processed|credited)|(?:has been|was|been) (?:processed|credited|completed)|refund(?:ed)? (?:of [^.\n]{0,30})?(?:is |has been )?(?:processed|credited|completed))\b/i);
      stage('REFUND_INITIATED', /\b(?:refund[^.\n]{0,40}(?:initiated|pending|processing)|initiated[^.\n]{0,40}refund|not (?:yet )?(?:received|credited|reflected)|(?:haven'?t|hasn'?t) (?:received|got)[^.\n]{0,20}|refund[^.\n]{0,30}(?:aane wala|aane wali|aayega|aayegi)|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili))/i);
      break;
    case 'PAYMENT':
      stage('PAYMENT_FAILED', /\b(?:payment|transaction)[^.\n]{0,30}(?:failed|declined|unsuccessful)\b/i);
      if (!notYet) stage('PAYMENT_SUCCESS', /\b(?:payment|transaction)[^.\n]{0,30}(?:successful|success|received|completed)\b/i);
      stage('PAYMENT_PENDING', /\b(?:payment|transaction|bill|invoice|salary)[^.\n]{0,40}(?:pending|due|not received|awaiting|processing)\b|\b(?:pending|due) (?:payment|amount)\b/i);
      break;
    case 'DOCUMENT':
      stage('DOC_TO_SUBMIT', USER_ACTION);
      stage('DOC_AWAITED', /\b(?:will send|will share|waiting for|awaiting|requested)[^.\n]{0,40}/i);
      break;
    case 'REPAIR':
    case 'SERVICE_REQUEST':
      if (!notYet) stage('REQUEST_RESOLVED', /\b(?:has been |is |was )?(?:resolved|closed|fixed|repaired|ready for (?:pickup|collection))\b/i);
      stage('REQUEST_SUBMITTED', /\b(?:submitted|raised|registered|created|given (?:it )?for repair|logged)\b[^.\n]{0,40}/i);
      break;
    case 'DELIVERY':
      if (!notYet) stage('DELIVERED', /\b(?:has been |was |been )?delivered\b/i);
      stage('DELIVERY_PENDING', /\b(?:shipped|out for delivery|dispatched|will be delivered|not (?:yet )?delivered|arriving)\b[^.\n]{0,30}/i);
      break;
    case 'APPOINTMENT':
      stage('APPOINTMENT_SCHEDULED', /\b(?:appointment|consultation|booked|scheduled)\b[^.\n]{0,40}/i);
      break;
    default:
      break;
  }
  const stageValue = lifecycleStage as Extraction['lifecycleStage'];
  const completed = stageValue === 'REFUND_COMPLETED' || stageValue === 'PAYMENT_SUCCESS' || stageValue === 'REQUEST_RESOLVED' || stageValue === 'DELIVERED';

  // Classification
  const pending = PENDING.test(text);
  const userAction = find(text, USER_ACTION);
  let classification: Classification;
  let waitingOn: WaitingOn = 'UNKNOWN';
  let isCommitment = true;
  if (INFORMATIONAL.test(text) && !pending) {
    classification = 'INFORMATIONAL';
    isCommitment = false;
  } else if (completed) {
    classification = 'COMPLETED';
    isCommitment = false;
  } else if (category === 'APPOINTMENT') {
    classification = 'APPOINTMENT';
    waitingOn = 'USER';
  } else if (stageValue === 'DOC_TO_SUBMIT' || (userAction && category !== 'REFUND')) {
    classification = 'PENDING_ACTION';
    waitingOn = 'USER';
  } else if (category === 'REFUND' || category === 'REIMBURSEMENT' || stageValue === 'PAYMENT_PENDING') {
    classification = 'WAITING_PAYMENT';
    waitingOn = 'OTHER_PARTY';
  } else if (pending) {
    classification = 'WAITING_RESPONSE';
    waitingOn = 'OTHER_PARTY';
  } else {
    classification = 'UNCERTAIN';
    isCommitment = category !== null;
    uncertainties.push('Could not tell whether anything is still pending');
  }

  // Dates
  let deadline: Extraction['deadline'] = null;
  for (const [re, kind] of DEADLINE_RULES) {
    const hit = find(text, re);
    if (hit) {
      deadline = { expression: hit.text, kind, evidence: hit.text };
      break;
    }
  }
  const eventHit = find(text, EVENT_RULE);
  const eventDate = eventHit ? { expression: eventHit.text, evidence: eventHit.text } : null;

  // Title / summary / next action
  const noun = category ? NOUNS[category] : null;
  // Only show ₹ when the text itself says rupees.
  const amountDisplay = amount ? (amount.currency === 'INR' ? `₹${amount.value}` : amount.value) : '';
  let title: string;
  if (noun && category !== 'OTHER' && counterparty && counterpartyIsPerson) {
    // People read better after the noun: "Appointment with Dr. Vivek Gupta", "Document from Rahul".
    const link = category === 'APPOINTMENT' ? 'with' : waitingOn === 'USER' ? 'for' : 'from';
    title = [`${cap(noun)} ${link} ${counterparty.name}`, amountDisplay].filter(Boolean).join(' ');
  } else if (noun && category !== 'OTHER') {
    title = [counterparty?.name, counterparty ? noun : cap(noun), amountDisplay].filter(Boolean).join(' ');
  } else {
    title = text.split(/[.\n]/)[0].slice(0, 60).trim() || 'Untitled';
  }
  const summary = text.length > 200 ? `${text.slice(0, 197)}...` : text;

  let nextAction: Extraction['nextAction'] = null;
  if (isCommitment) {
    if (classification === 'PENDING_ACTION' && userAction) nextAction = { text: cap(userAction.text.trim()), evidence: userAction.text };
    else if (classification === 'WAITING_PAYMENT') nextAction = { text: "Follow up if the money hasn't arrived", evidence: null };
    else if (classification === 'APPOINTMENT') nextAction = { text: 'Attend the appointment', evidence: null };
    else nextAction = { text: "Follow up if you don't hear back", evidence: null };
  }

  if (isCommitment && !counterparty && waitingOn === 'OTHER_PARTY') uncertainties.push("Who you're waiting on isn't named");

  return {
    isCommitment,
    classification,
    category,
    lifecycleStage: stageValue,
    lifecycleEvidence,
    title,
    summary,
    waitingOn,
    counterparty,
    nextAction,
    deadline,
    amount,
    identifiers,
    eventDate,
    uncertainties,
  };
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    return { raw: mockExtract(req.text), provider: this.name, model: 'rules-v1', promptVersion: 'mock-v1' };
  }
}
