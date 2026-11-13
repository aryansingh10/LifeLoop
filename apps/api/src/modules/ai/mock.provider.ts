import type { Category, Classification, Extraction, WaitingOn } from '../extraction/extraction.schema.js';
import type { AiProvider, ExtractionRequest, ExtractionResponse } from './ai-provider.js';

/**
 * Offline, deterministic, rule-based extractor (rules-v2). Lets the whole product run with no API key
 * and gives tests stable output. It follows the same contract as the real model: values come with
 * verbatim evidence quotes and dates are returned as expressions (code computes the actual dates).
 *
 * Measured with `npm run eval -w apps/api` (1,000 labelled messages across 10 categories).
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

const rx = (source: string, flags = 'i') => new RegExp(source, flags);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One "sentence character": anything but a full stop/newline, except dots in "Rs.", "Dr." and decimals. */
const SC = String.raw`(?:[^.\n]|\.(?=\s?\d)|(?<=\b(?:Rs|rs|Dr|Mr|Mrs|Ms|No|Prof|St))\.)`;

// ------------------------------------------------------------------ companies and people

/** Well-known Indian brands. Anything else is found by the general patterns in findParty(). */
const KNOWN_COUNTERPARTIES = [
  'Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Swiggy', 'Zomato', 'Blinkit', 'Zepto', 'BigBasket', 'JioMart',
  'Uber', 'Ola', 'Rapido', 'IRCTC', 'MakeMyTrip', 'Goibibo', 'IndiGo', 'Air India', 'Vistara', 'SpiceJet', 'Airtel', 'Jio', 'Vi',
  'BSNL', 'Tata Play', 'HDFC', 'ICICI', 'SBI', 'Axis Bank', 'Kotak', 'Paytm', 'PhonePe', 'Google Pay', 'GPay', 'CRED',
  'Samsung', 'Apple', 'OnePlus', 'Xiaomi', 'Realme', 'Vivo', 'Oppo', 'Dell', 'HP', 'Lenovo', 'Croma', 'Reliance Digital',
  'Urban Company', 'LIC', 'Bajaj', 'Decathlon', 'IKEA', 'Netflix', 'Hotstar', 'Spotify', 'Lenskart',
];

/** Capitalised words that are never a company or person by themselves. */
const NOT_A_NAME = new Set([
  'I', 'The', 'A', 'An', 'My', 'Your', 'Our', 'Their', 'His', 'Her', 'He', 'She', 'They', 'We', 'You', 'It', 'This', 'That', 'These', 'Those',
  'Today', 'Tomorrow', 'Yesterday', 'Tonight', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'Customer', 'Support', 'Team', 'Dear', 'Hi', 'Hello', 'Hey', 'Please', 'Kindly', 'Thanks', 'Thank', 'Sorry', 'Ok', 'Okay', 'Yes', 'No', 'Reminder', 'Note', 'Update',
  'Refund', 'Order', 'Orders', 'Payment', 'Payments', 'Ticket', 'Bank', 'Bill', 'EMI', 'Salary', 'Invoice', 'Parcel', 'Package', 'Courier', 'Delivery', 'Delivered',
  'Out', 'Got', 'Had', 'Paid', 'Lent', 'Need', 'Have', 'Has', 'Submit', 'Submitted', 'Upload', 'Called', 'Raised', 'Escalated', 'Cancelled', 'Requested', 'Received',
  'Still', 'Expected', 'Interview', 'Meeting', 'Haircut', 'Dentist', 'Passport', 'Medical', 'Insurance', 'Mediclaim', 'Expense', 'Internet', 'Broadband',
  'Reimbursement', 'Manager', 'Weather', 'Flat', 'Congratulations', 'Happy', 'Shop', 'Mom', 'Dad', 'Mummy', 'Papa', 'Bhaiya', 'Didi',
  // roles: a real party but not a name
  'Plumber', 'Electrician', 'Carpenter', 'Mechanic', 'Technician', 'Engineer', 'Doctor', 'Driver', 'Landlord', 'Owner', 'Tenant', 'Client', 'Vendor',
  'Seller', 'Agent', 'Office', 'College', 'School', 'University', 'Company', 'HR', 'Finance', 'Accounts', 'Admin', 'Society', 'Boss', 'Friend', 'Guy',
  'Follow', 'Follow-up', 'Car', 'Service', 'SIM', 'Name', 'KYC', 'PAN', 'Aadhaar', 'NOC', 'OTP', 'Form', 'Your',
  'Rs', 'INR', 'USD', 'AC', 'TV', 'LED', 'Good', 'Morning', 'Night', 'Waiting', 'Geyser', 'Fridge', 'Laptop', 'Phone', 'Electricity', 'Water', 'Gas', 'Power',
]);

/** Words that end a name ("Dr Sharma at 5pm", "Rahul ne bola"). */
const NAME_STOP = new Set([
  'at', 'on', 'in', 'for', 'from', 'to', 'with', 'and', 'or', 'about', 'regarding', 'by', 'the', 'is', 'was', 'has', 'have', 'will', 'would',
  'said', 'told', 'promised', 'today', 'tomorrow', 'tonight', 'yesterday', 'ki', 'ka', 'ke', 'ko', 'se', 'ne', 'ji', 'sir', 'madam', 'clinic', 'hospital',
]);
const TITLES = '(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Prof|Professor|Adv|Advocate|Shri|Smt|Sri)';

/** A capitalised name of up to three words: "Pepperfry", "Tata CLiQ", "ICICI Lombard", "redBus", "Pooja Iyer". */
const NAME = String.raw`(?:[A-Z][A-Za-z0-9&'’]*|[a-z]+[A-Z][A-Za-z0-9]*)(?: (?:[A-Z][A-Za-z0-9&'’]*))?(?: (?:[A-Z][A-Za-z0-9&'’]*))?`;

const TRAILING_DROP = new Set([
  'Today', 'Tomorrow', 'Yesterday', 'Tonight', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Rs', 'INR',
]);

function cleanName(raw: string): string | null {
  const words = raw.split(' ');
  // Only time words are trimmed from the end ("Rahul Today" -> "Rahul"); "Tata Power", "Fortis Hospital" stay whole.
  while (words.length && TRAILING_DROP.has(words[words.length - 1])) words.pop();
  while (words.length && NOT_A_NAME.has(words[0])) words.shift(); // "Called Hathway" -> "Hathway"
  if (!words.length) return null;
  if (words.length === 1 && words[0].length < 2) return null;
  return words.join(' ');
}

interface Party {
  name: string;
  evidence: string;
  person: boolean;
}

function titledPerson(source: string): Party | null {
  // Honorific + up to three words (works for lowercase too: "dr sharma").
  const titled = find(source, rx(String.raw`\b${TITLES}\b\.?\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})`));
  if (!titled) return null;
  const kept: string[] = [];
  for (const w of titled.groups[0].split(/\s+/)) {
    if (NAME_STOP.has(w.toLowerCase())) break;
    kept.push(w);
  }
  if (!kept.length) return null;
  const titleText = titled.text.slice(0, titled.text.length - titled.groups[0].length).trimEnd();
  const evidence = `${titleText} ${kept.join(' ')}`.replace(/\s+/g, ' ');
  if (!source.includes(evidence)) return null;
  const pretty = `${cap(titleText.toLowerCase().replace(/^doctor/, 'dr'))} ${kept.map((w) => cap(w)).join(' ')}`;
  return { name: pretty.replace(/^(Dr|Mr|Mrs|Ms|Prof)(?!\.) /, '$1. '), evidence, person: true };
}

/** Known brand, extended by following capitalised words: "ICICI" + "Lombard", "Bajaj" + "Finserv". */
function knownBrand(source: string): Party | null {
  let best: { index: number; name: string; text: string } | null = null;
  for (const name of KNOWN_COUNTERPARTIES) {
    const m = rx(String.raw`\b${escapeRe(name)}(?:\.in|\.com)?\b`).exec(source);
    if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best.text.length))) best = { index: m.index, name, text: m[0] };
  }
  if (!best) return null;
  const rest = source.slice(best.index + best.text.length);
  const ext = /^((?: [A-Z][A-Za-z0-9&]+){1,2})/.exec(rest);
  if (ext) {
    const extra = ext[1].trim().split(' ').filter((w) => !NOT_A_NAME.has(w) && !/^(?:Service|Center|Centre|Customer|Care|Support|Hospital|Clinic)$/i.test(w));
    if (extra.length && extra.length === ext[1].trim().split(' ').length) {
      const text = `${best.text} ${extra.join(' ')}`;
      return { name: text, evidence: text, person: false };
    }
  }
  return { name: best.name, evidence: best.text, person: false };
}

/** "remind" -> "[Rr]emind": capitalised verbs at sentence start, while NAME stays case-sensitive. */
const anyCase = (words: string) =>
  words
    .split('|')
    .map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`)
    .join('|');

const PARTY_NOUNS =
  'order|refund|booking|package|parcel|shipment|bill|account|loan|card|app|recharge|subscription|policy|claim|cashless|approval|premium|membership|delivery|service|technician|engineer|complaint|courier|connection|workshop|garage|store|showroom|office|branch|team|hospital|support|customer care|internet|broadband|emi|credit card';

/** Ordered general patterns; the first that yields a real name wins. */
const PARTY_PATTERNS: Array<{ re: RegExp; person: boolean }> = [
  { re: rx(String.raw`^\s*(${NAME})\s*:`, ''), person: false }, // "Purplle: Refund of ₹2499 processed"
  { re: rx(String.raw`(?:^|[\s.!])(?:-|–|—)\s*(?:Team\s+)?(${NAME})\s*[.!]?\s*$`, ''), person: false }, // "- Team Purplle"
  { re: rx(String.raw`\bTeam (${NAME})\b`, ''), person: false },
  { re: rx(String.raw`\b(${NAME}) (?:service cent(?:er|re)|customer care|support|hospital|clinic|insurance|bank|workshop|garage|store|showroom)\b`, 'g'), person: false },
  { re: rx(String.raw`\b(?:[Mm]y|[Yy]our|[Tt]he|[Oo]ur)\s+(${NAME})\s+(?:[a-z]+\s+)?(?:${PARTY_NOUNS})\b`, 'g'), person: false }, // "your BESCOM electricity bill"
  { re: rx(String.raw`\b(${NAME})\s+(?:ka|ki|ke|ne|ko|se|wale|wali|wala)\b`, 'g'), person: false },
  { re: rx(String.raw`(?:^|[.!?,]\s+)(${NAME})\s+(?:${PARTY_NOUNS}|fixed|settled|initiated|asked|delivery guy|says|said)\b`, 'g'), person: false },
  { re: rx(String.raw`\b(${NAME})\s+(?:said|says|promised|told|will|would|has (?:promised|returned|paid|not)|hasn'?t|didn'?t|returned|paid back|paid|owes|asked|borrowed|gave|took|lent|bole|bola|boli)\b`, 'g'), person: true },
  { re: rx(String.raw`\b(?:${anyCase('promised|told|tell|asked|remind|called|call|text|message|lent|lend|owe|meet|visit|pay|paid')})\s+(${NAME})\b`, 'g'), person: true },
  { re: rx(String.raw`\b(?:from|with|to|at|by|via)\s+(?:the\s+)?(${NAME})\b`, 'g'), person: false }, // "with the Razorpay team"
  { re: rx(String.raw`\b(${NAME})'s\b`, 'g'), person: true },
];

function findParty(source: string): Party | null {
  const known = knownBrand(source);
  if (known) return known;
  const titled = titledPerson(source);
  for (const { re, person } of PARTY_PATTERNS) {
    for (const hit of findAll(source, re)) {
      const name = cleanName(hit.groups[0]);
      if (!name) continue;
      if (titled && titled.evidence.includes(name)) return titled;
      return { name, evidence: name, person };
    }
  }
  return titled;
}

// ------------------------------------------------------------------ categories

const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ['REFUND', /\brefund(?:ed|s)?\b|\bpaisa wapas\b|\bmoney back\b|\bcharged (?:me )?twice\b/i],
  ['REIMBURSEMENT', /\breimburse(?:ment|d)?\b|\bclaims?\b|\bmediclaim\b|\bcashless\b|\ballowance\b|\bexpense portal\b/i],
  ['REPAIR', /\b(?:repair(?:ed|ing)?|technician|service cent(?:er|re)|mechanic|servicing|plumber|electrician|carpenter|engineer visit|workshop|garage|not (?:working|cooling|charging|starting|turning on)|leaking|broken|theek (?:ho|kar)\w*)\b/i],
  ['DELIVERY', /\b(?:deliver(?:y|ed)?|shipped|shipment|out for delivery|dispatched|courier|parcel|package|in transit|tracking|awb|return pickup|pickup|arriving|pahunch\w*)\b|\border\b[^.\n]{0,30}\b(?:nahi aaya|not (?:yet )?(?:received|arrived)|aa jayega|arrive)|\bwhere is my\b|\border (?:is )?(?:delayed|late)\b/i],
  ['APPOINTMENT', /\b(?:appointment|consultation|meeting|interview|haircut|salon|spa|check-?up|vaccination|vaccine|slot|booked for|scheduled (?:for|on|with)|bulaya hai|session|(?:blood|lab|driving|eye|medical) test|test drive|scan|x-?ray|mri|zoom call|video call|call with|demo|(?<!for )(?:lunch|dinner|coffee|catch-?up|party|ceremony|function) (?:with|at|on|tomorrow|today|tonight|this|next))\b/i],
  ['DOCUMENT', /\b(?:documents?|certificates?|pan card|aadhaa?r|marksheets?|kyc|form 16|forms?|agreements?|papers|letters?|(?:address|income|id) proofs?|noc|passport|licen[cs]e|visa|receipts?|slips?|itr|acknowledgement|fir copy|copy of)\b/i],
  ['PAYMENT', /\b(?:payment|pay|paid|transaction|upi|emi|invoice|salary|bill|bills|rent|kiraya|recharge|credit card|loan|dues|paise|paisa|bijli|fees?|premium|maintenance (?:charges?|fees?|dues|bill|of)|society maintenance|owes? me|transfer)\b/i],
  ['SERVICE_REQUEST', /\b(?:ticket|complaint|service request|request(?: id| no| number)?|customer care|helpline|support|escalat\w*|broadband|internet|wifi|sim|connection|activat\w*|unfreeze|chargeback|amc|callback)\b/i],
  ['PERSONAL_PROMISE', /\b(?:promised|promise|will send|will share|will get back|lent|borrowed|owes?|owed|return(?:ed)? (?:my|the)|returned|get it back|given it back|gave back|pay(?:s|ing)? (?:me |him |her |them )?back|paid back|de dega|de degi|wapas kar\w*|told \w+ I|I'?d (?:call|send)|confirm)\b|\b(?:said|says|told me|bole|bola|boli)\b[^.\n]{0,25}\b(?:will|would|'ll|denge|dega|degi)\b|'s \w+ (?:by|on|tomorrow|today)|\b(?:return|give back|lautana)\s+[A-Z]\w*(?: [A-Z]\w*)?'s\b/i],
];

// ------------------------------------------------------------------ status signals

const INFORMATIONAL = /\b(?:otp|one[- ]time password|verification code|\d+% off|flat \d+%|sale|offer ends|offers? available|newsletter|unsubscribe|congratulations|you have won|happy (?:diwali|holi|new year|birthday|independence)|thank you for shopping|statement (?:is|for)|now available|password was changed|weather update|top picks|how are you|long time no see|used \d+% of|avl\.? bal|available balance|debited from your (?:a\/c|account)|(?:notes|minutes|files?) (?:from \w+ )?(?:are |is )?attached|for (?:your )?reference|good morning|good night|membership has been renewed|trip receipt|new login|has been placed|thanks for rating|supply will be (?:interrupted|disrupted|off)|power cut|outage|scheduled maintenance|will be unavailable|downtime)\b/i;

/** Service notices are information even though they use future tense ("supply will be interrupted"). */
const NOTICE = /\b(?:supply will be (?:interrupted|disrupted|off)|power cut|outage|scheduled maintenance|will be unavailable|downtime|services? will be (?:down|affected))\b/i;

/** Things still open. "Strong" signals beat a completion word or an informational look. */
const STRONG_PENDING = rx(
  String.raw`\b(?:not (?:yet )?(?:received|credited|arrived|reflected|delivered|resolved|returned|paid|fixed|working|done|attended|showing|shared|cooling|charging)|haven'?t|hasn'?t|has not|didn'?t (?:show up|come|turn up|call|arrive|reply|respond|get)|did not (?:show up|come|call)|yet to|still|pending|awaiting|waiting|no (?:update|response|reply|news|call)(?: yet)?|due|owes?|(?:will|would|'ll|shall) (?:be )?[a-z]+|promised|where is my|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili|hua|hui|pahuncha|pahunchi|bheja|bheji|diya|di)|aane wala|aane wali|aayega|aayegi|ho jayega|ho jayegi|ho jayenge|aa jayega|aa jayegi|missing|damaged|defective|wrong item|de dega|de degi|denge|karenge|kar denge|kar dega|bhejenge|bhejega|aayenge)\b`,
);
const WEAK_PENDING = rx(
  String.raw`\b(?:initiated|submitted|raised|registered|scheduled|booked|expected|may take|in (?:process|progress)|under (?:process|review|processing)|stuck|delayed|shipped|dispatched|out for delivery|in transit|arriving|approved|payout|down since|lent|get it back|confirmed for|requested|fixed for|moved to|rescheduled|expires?)\b`,
);
const COMPLETED = rx(
  String.raw`\b(?:credited|received|processed|completed|delivered|resolved|closed|fixed(?! for| on| at)|repaired|replaced|returned|refunded|settled|paid back|paid|gave back|given back|done|successful|successfully|collected|handed back|verified|works fine|working fine|sorted|all good|all fine|went well|aa gaya|aa gayi|mil gaya|mil gayi|ho gaya|ho gayi|got (?:my|the|it)|had my (?:appointment|meeting|interview|consultation)|attended|went for)\b`,
);
/** "not delivered", "will be credited", "hasn't returned", "to be paid" are not completions. */
// Contractions only: "hasn't"/"hasnt" — not the "nt" at the end of "complaint" or "payment".
const NEGATED_BEFORE =
  /(?:\bnot|\b\w+n't|\b(?:hasnt|havent|hadnt|didnt|doesnt|dont|wont|isnt|wasnt|arent|werent|cant|couldnt|wouldnt|shouldnt)|\bnever|\byet to|\bwill|\bwould|\bto be|\bbe|\bexpected to|\bshould|\bshall|\bonce|\bif|\bwhen|\buntil|\bbefore)\s+(?:\w+\s+){0,2}$/i;

function completionHit(text: string): Hit | null {
  for (const hit of findAll(text, COMPLETED)) {
    if (!NEGATED_BEFORE.test(text.slice(Math.max(0, hit.index - 30), hit.index))) return hit;
  }
  return null;
}

/** The user has to act: to-dos, bills they owe, their own promises. */
// "need to / have to / must + any verb" is a to-do; "please/kindly" only with real task verbs ("Please rate us" is not).
const USER_VERBS = 'submit|upload|send|provide|share|pay|complete|sign|bring|collect|pick up|get|update|renew|return|visit|book|attend|fill|call|apply|file|link|verify|carry|deposit|transfer|reply|email|meet|go|confirm';
const USER_ACTION = rx(
  String.raw`\b(?:i |you |we )?(?:need to|needs to|have to|has to|must|got to|should|remember to|don'?t forget to) (?:be )?[a-z]+\b${SC}{0,60}|\b(?:please|kindly) (?:${USER_VERBS})\b${SC}{0,60}|\bneed (?:a |the |my )?(?:\w+ )?(?:sign-?off|approval|signature)\b${SC}{0,40}`,
);
const USER_IMPERATIVE = rx(String.raw`^\s*(?:please |kindly )?(?:submit|upload|send|share|pay|bring|fill|complete|sign|return|collect|renew|apply|file|book|call|email|attend|visit|update|carry|buy|check|take|get|chase|follow up|ask)\b${SC}{0,60}`);
const USER_OWES = rx(String.raw`\b(?:bill|bills|emi|rent|premium|dues?|fees?|installment|credit card(?: payment| bill)?|loan|payment|maintenance)\b${SC}{0,40}\b(?:is |are )?due\b(?! from)|\b(?:need to|have to|must|got to|should) pay\b|\bto be paid\b|\bpay by\b|\bbhar(?:na|ne) hai\b|\b(?:dena|jama karna|bhejne|bhejna|karna|jana|aana|milna|lena|bulana|karwana|lana|dikhana|lagwana) hai[n]?\b|\b(?:bhejne|dene) hain\b|^\s*(?:I )?owe [A-Z]|\bpay (?:him|her|them) back\b`);
const USER_PROMISE = rx(String.raw`\bI\s+(?:promised|told|assured|committed)\b|^\s*promised\b|\btold \w+(?: \w+)? I\b|\bI(?:'d| would| will|'ll) [a-z]+\b`);
/** Someone owes the user money or a thing. */
const OTHER_OWES = rx(String.raw`\bowes? me\b|\b(?:hasn'?t|has not|didn'?t|did not|not) (?:yet )?paid\b|\bpay(?:s)? (?:me )?back\b|\bwill pay\b|\bsalary\b|\bget it back\b|\bde dega\b|\bde degi\b|\breversal\b|\bnot (?:yet )?(?:received|credited)\b|\bhasn'?t (?:given|returned)\b`);

// ------------------------------------------------------------------ amounts

/** 2-7 digit amounts, optionally grouped (1,00,000 / 12,500) or with paise; avoids long IDs. */
const MONEY_NUMBER = String.raw`(?:\d{1,3}(?:,\d{2,3})+|\d{2,7})(?:\.\d{1,2})?`;
const MONEY_WORDS = 'refund|refunded|payment|paid|cashback|bill|bills|amount|reimbursement|deposit|fees?|salary|emi|charges?|paise|paisa|rupaye|rupay|rent';
const AMOUNT_FILLERS = '(?:ka|ki|ke|of|worth|wala|wali|the|my|bijli|electricity|phone|mobile|internet|water|gas|travel|medical|office|total)';

// ------------------------------------------------------------------ dates

const NUMBER_WORD = '(?:\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';
const TIME_OF_DAY = String.raw`\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?)`;
const WEEKDAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const DAY_WORD = `(?:day after tomorrow|tomorrow|today|tonight|(?:on |this |next )?${WEEKDAY})`;
const DEADLINE_RULES: Array<[RegExp, 'EXPLICIT' | 'ESTIMATED']> = [
  // "at 2 p.m tomorrow", "tomorrow at 2pm", "on Friday at 10:30 am", "kal shaam 5 baje"
  [rx(String.raw`\b(?:at |by )?${TIME_OF_DAY}\s+(?:on\s+)?${DAY_WORD}\b|\b${DAY_WORD}\s+(?:at |by )?${TIME_OF_DAY}`), 'EXPLICIT'],
  [rx(String.raw`\b(?:kal|parso|aaj|${WEEKDAY})(?: ko)?\s+(?:(?:subah|shaam|dopahar|raat)\s+)?\d{1,2}\s*baje\b`), 'EXPLICIT'],
  [rx(String.raw`\b${NUMBER_WORD} ?(?:-|to|–) ?${NUMBER_WORD} (?:business |working )?(?:days?|weeks?)\b`), 'ESTIMATED'],
  [rx(String.raw`\b(?:within|in|next|after|takes?|said|around|about|inside)\s+${NUMBER_WORD} (?:business |working )?(?:days?|hours?|weeks?|months?)\b`), 'ESTIMATED'],
  [rx(String.raw`\b${NUMBER_WORD} (?:din|hafte)(?: me| mein| main| tak)?\b`), 'ESTIMATED'],
  [/\b(?:next week|this week|next month|end of (?:the )?(?:week|month)|next cycle)\b/i, 'ESTIMATED'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, 'EXPLICIT'],
  [/\b\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?: \d{4})?\b/i, 'EXPLICIT'],
  [/\b(?:on|by|before|till|until) (?:the )?\d{1,2}(?:st|nd|rd|th)\b/i, 'EXPLICIT'],
  [rx(String.raw`\b(?:by|before|on|this|next|coming|for|till|until|to) ${WEEKDAY}\b|\b${WEEKDAY} (?:tak|ko)\b`), 'EXPLICIT'],
  [/\b(?:day after tomorrow|tomorrow|by (?:the )?evening|by end of day|by eod|tonight|kal tak|parso tak)\b/i, 'EXPLICIT'],
];
const EVENT_RULE = /\b(day before yesterday|yesterday|last (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i;
/** "initiated my refund on 2 Nov" describes the past, not a deadline. */
const PAST_CONTEXT = /\b(?:initiated|placed|ordered|submitted|raised|filed|paid|bought|purchased|cancelled|returned|gave|given|had|was|were|happened|delivered|received|came|went|started|applied)\b/i;
const FUTURE_CUE = /\b(?:will|by|due|expected|scheduled|booked|confirmed|for|till|until|before|next|tak|should|must|need)\b/i;

function findDeadline(text: string): Extraction['deadline'] {
  for (const [re, kind] of DEADLINE_RULES) {
    for (const hit of findAll(text, re)) {
      if (kind === 'EXPLICIT' && !/^(?:by|before|till|until)\b/i.test(hit.text)) {
        // Look back to the start of this sentence (up to 70 chars; "Rs.1299.00" is not a sentence end).
        const before = text.slice(Math.max(0, hit.index - 70), hit.index).split(/[!?\n]|\.\s(?=[A-Z])/).pop() ?? '';
        if (PAST_CONTEXT.test(before) && !FUTURE_CUE.test(before)) continue; // a past event, not a deadline
      }
      return { expression: hit.text, kind, evidence: hit.text };
    }
  }
  return null;
}

// ------------------------------------------------------------------ extraction

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

const PENDING_STAGES = new Set(['REFUND_INITIATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'DOC_AWAITED', 'REQUEST_SUBMITTED', 'DELIVERY_PENDING', 'APPOINTMENT_SCHEDULED', 'DOC_TO_SUBMIT']);

export function mockExtract(text: string): Extraction {
  const uncertainties: string[] = [];

  let category: Category | null = null;
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(text)) {
      category = cat;
      break;
    }
  }

  // Company / person
  const party = findParty(text);
  const counterparty: Extraction['counterparty'] = party ? { name: party.name, evidence: party.evidence } : null;

  // Amount
  let amount: Extraction['amount'] = null;
  const amountHit = find(text, /(₹|\brs\.?|\binr\b)\s?([\d,]+(?:\.\d{1,2})?)/i) ?? find(text, /\b([\d,]+(?:\.\d{1,2})?)\s?(rupees|rs\.?|inr)\b/i);
  if (amountHit) {
    const value = /\d/.test(amountHit.groups[1]) ? amountHit.groups[1] : amountHit.groups[0];
    amount = { value, currency: 'INR', evidence: amountHit.text };
  } else {
    // A bare number next to a money word: "500 ka refund", "refund of 1,200", "371 ka bijli bill".
    // No currency is written, so none is claimed (validation adds "Currency not stated").
    const bare =
      find(text, rx(String.raw`\b(${MONEY_NUMBER})\s+(?:${AMOUNT_FILLERS}\s+){0,3}(?:${MONEY_WORDS})\b`)) ??
      find(text, rx(String.raw`\b(?:${MONEY_WORDS})\s+(?:(?:of|ka|ki|ke|amount|for)\s+){0,2}(${MONEY_NUMBER})\b(?!\s*(?:days?|din|hours?|weeks?|%))`));
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

  // Status: open vs done
  const strongPending = STRONG_PENDING.test(text);
  const weakPending = WEAK_PENDING.test(text);
  const done = strongPending ? null : completionHit(text);

  // Lifecycle stage (evidence is always a verbatim quote)
  let lifecycleStage: Extraction['lifecycleStage'] = null;
  let lifecycleEvidence: string | null = null;
  const stage = (s: NonNullable<Extraction['lifecycleStage']>, re: RegExp | Hit | null): boolean => {
    const hit = re instanceof RegExp ? find(text, re) : re;
    if (hit && !lifecycleStage) {
      lifecycleStage = s;
      lifecycleEvidence = hit.text;
      return true;
    }
    return false;
  };
  switch (category) {
    case 'REFUND':
    case 'REIMBURSEMENT':
      if (done) stage('REFUND_COMPLETED', done);
      stage('REFUND_INITIATED', rx(String.raw`\b(?:refund${SC}{0,40}(?:initiated|pending|processing|expected)|initiated${SC}{0,40}refund|not (?:yet )?(?:received|credited|reflected)|(?:haven'?t|hasn'?t) (?:received|got)${SC}{0,20}|refund${SC}{0,30}(?:aane wala|aane wali|aayega|aayegi)|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili)|(?:claim|reimbursement)${SC}{0,40}(?:pending|under process|filed|submitted|approved))`));
      break;
    case 'PAYMENT':
      stage('PAYMENT_FAILED', rx(String.raw`\b(?:payment|transaction)${SC}{0,30}(?:failed|declined|unsuccessful)\b`));
      if (done) stage('PAYMENT_SUCCESS', done);
      stage('PAYMENT_PENDING', rx(String.raw`\b(?:payment|transaction|bill|invoice|salary|emi|rent|credit card)${SC}{0,40}(?:pending|due|not received|awaiting|processing)\b|\b(?:pending|due) (?:payment|amount)\b|\bhasn'?t paid\b|\bowes me\b`));
      break;
    case 'DOCUMENT':
      if (done) stage('OTHER', done);
      stage('DOC_TO_SUBMIT', USER_ACTION);
      stage('DOC_TO_SUBMIT', USER_IMPERATIVE);
      stage('DOC_AWAITED', rx(String.raw`\b(?:will (?:send|share|issue)|waiting for|awaiting|requested|promised to)${SC}{0,40}`));
      break;
    case 'REPAIR':
    case 'SERVICE_REQUEST':
      if (done) stage('REQUEST_RESOLVED', done);
      stage(
        'REQUEST_SUBMITTED',
        rx(String.raw`\b(?:(?:gave|given|dropped(?: off)?|handed(?: over)?|left|sent|took|taken|submitted)\b${SC}{0,30}\bfor (?:repair|service|servicing|replacement)|(?:submitted|raised|registered|created|logged|escalated)\b${SC}{0,40}|complaint (?:number|no|id)${SC}{0,20})`),
      );
      break;
    case 'DELIVERY':
      if (done) stage('DELIVERED', done);
      stage('DELIVERY_PENDING', /\b(?:shipped|out for delivery|dispatched|will be delivered|not (?:yet )?delivered|arriving|in transit|expected delivery)\b[^.\n]{0,30}/i);
      break;
    case 'APPOINTMENT':
      if (done) stage('OTHER', done);
      stage('APPOINTMENT_SCHEDULED', /\b(?:appointment|consultation|meeting|interview|booked|scheduled|bulaya)\b[^.\n]{0,40}/i);
      break;
    default:
      break;
  }
  const stageValue = lifecycleStage as Extraction['lifecycleStage'];

  // Who acts next, and is it still open?
  const userAction = find(text, USER_ACTION) ?? find(text, USER_IMPERATIVE);
  const userSignal = Boolean(userAction || USER_OWES.test(text) || USER_PROMISE.test(text));
  const otherOwes = OTHER_OWES.test(text);
  const pending = strongPending || weakPending || (stageValue !== null && PENDING_STAGES.has(stageValue));

  let classification: Classification;
  let waitingOn: WaitingOn = 'UNKNOWN';
  let isCommitment = true;
  if (((INFORMATIONAL.test(text) && !strongPending) || NOTICE.test(text)) && !userSignal) {
    classification = 'INFORMATIONAL';
    isCommitment = false;
  } else if (done) {
    classification = 'COMPLETED';
    isCommitment = false;
  } else if (category === 'APPOINTMENT') {
    classification = 'APPOINTMENT';
    waitingOn = 'USER';
  } else if (userSignal && !(otherOwes && !USER_OWES.test(text) && !USER_PROMISE.test(text) && !userAction)) {
    classification = 'PENDING_ACTION';
    waitingOn = 'USER';
  } else if (category === 'REFUND' || category === 'REIMBURSEMENT' || otherOwes || stageValue === 'PAYMENT_PENDING') {
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
  // Without any category, pending-sounding words alone ("heavy rain expected") are not a commitment.
  if (isCommitment && category === null && !userSignal && !party && !strongPending) {
    classification = 'UNCERTAIN';
    isCommitment = false;
  }

  // Dates
  const deadline = findDeadline(text);
  const eventHit = find(text, EVENT_RULE);
  const eventDate = eventHit ? { expression: eventHit.text, evidence: eventHit.text } : null;

  // Title / summary / next action
  const noun = category ? NOUNS[category] : null;
  // Only show ₹ when the text itself says rupees.
  const amountDisplay = amount ? (amount.currency === 'INR' ? `₹${amount.value}` : amount.value) : '';
  let title: string;
  if (noun && category !== 'OTHER' && counterparty && party?.person) {
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
    else if (classification === 'PENDING_ACTION') nextAction = { text: 'Take care of this', evidence: null };
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
    return { raw: mockExtract(req.text), provider: this.name, model: 'rules-v2', promptVersion: 'mock-v2' };
  }
}
