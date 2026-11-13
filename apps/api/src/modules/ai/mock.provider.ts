import type { Category, Classification, Extraction, WaitingOn } from '../extraction/extraction.schema.js';
import type { AiProvider, ExtractionRequest, ExtractionResponse } from './ai-provider.js';

/**
 * Offline, deterministic, rule-based extractor (rules-v3). Lets the whole product run with no API key
 * and gives tests stable output. It follows the same contract as the real model: values come with
 * verbatim evidence quotes and dates are returned as expressions (code computes the actual dates).
 *
 * Measured with `npm run eval -w apps/api` (1,000 / 100 / 60 hand-labelled messages) and
 * `npm run eval -w apps/api -- --set=large` (100,000 generated English + Hinglish messages).
 */
interface Hit {
  text: string;
  index: number;
  groups: string[];
}

function find(source: string, re: RegExp): Hit | null {
  re.lastIndex = 0;
  const m = re.exec(source);
  return m ? { text: m[0], index: m.index, groups: m.slice(1).map((g) => g ?? '') } : null;
}

const globalCache = new WeakMap<RegExp, RegExp>();
function findAll(source: string, re: RegExp): Hit[] {
  let g = globalCache.get(re);
  if (!g) {
    g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    globalCache.set(re, g);
  }
  const out: Hit[] = [];
  for (const m of source.matchAll(g)) out.push({ text: m[0], index: m.index ?? 0, groups: m.slice(1).map((x) => x ?? '') });
  return out;
}

const rx = (source: string, flags = 'i') => new RegExp(source, flags);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One "sentence character": anything but a full stop/newline, except dots in "Rs.", "Dr." and decimals. */
const SC = String.raw`(?:[^.\n]|\.(?=\s?\d)|(?<=\b(?:Rs|rs|Dr|Mr|Mrs|Ms|No|Prof|St))\.)`;

// ------------------------------------------------------------------ companies and people

/**
 * Well-known Indian brands, matched case-insensitively ("hdfc bank", "Yes Bank"). Anything else is found
 * by the general patterns in findParty(). Words that are also ordinary English/Hindi words are left out.
 */
const KNOWN_COUNTERPARTIES = [
  // shopping & delivery
  'Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Swiggy', 'Swiggy Instamart', 'Instamart', 'Zomato', 'Blinkit', 'Zepto', 'BigBasket',
  'JioMart', 'Snapdeal', 'Shopsy', 'Dunzo', 'Croma', 'Reliance Digital', 'Reliance Trends', 'Vijay Sales', 'Decathlon', 'IKEA', 'Lenskart',
  'Pepperfry', 'Urban Ladder', 'FirstCry', 'Purplle', 'Mamaearth', 'Bewakoof', 'Tata CLiQ', 'Tata Neu', 'DMart', 'Lifestyle', 'Westside',
  'Pantaloons', 'Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Xpressbees', 'Shadowfax', 'India Post', 'Speed Post', 'Porter', 'Urban Company',
  // travel
  'Uber', 'Ola', 'Rapido', 'IRCTC', 'MakeMyTrip', 'Goibibo', 'Cleartrip', 'Yatra', 'EaseMyTrip', 'ixigo', 'redBus', 'IndiGo', 'Air India',
  'Vistara', 'SpiceJet', 'Akasa Air', 'OYO', 'Airbnb',
  // telecom, TV, subscriptions
  'Airtel', 'Airtel Xstream', 'Jio', 'JioFiber', 'Vi', 'Vodafone', 'BSNL', 'MTNL', 'Tata Play', 'Dish TV', 'ACT Fibernet', 'Hathway', 'Excitel',
  'Netflix', 'Hotstar', 'Disney+ Hotstar', 'Spotify', 'YouTube Premium',
  // utilities
  'BESCOM', 'BSES', 'Tata Power', 'Adani Electricity', 'MSEDCL', 'MSEB', 'Torrent Power', 'TNEB', 'KSEB', 'CESC', 'Mahanagar Gas', 'IGL', 'Indane',
  'HP Gas', 'Bharat Gas',
  // banks, payments, lending, insurance
  'HDFC', 'HDFC Bank', 'ICICI', 'ICICI Bank', 'SBI', 'State Bank of India', 'Axis Bank', 'Kotak', 'Kotak Mahindra Bank', 'Yes Bank', 'IDFC First',
  'IDFC First Bank', 'IndusInd', 'IndusInd Bank', 'Bank of Baroda', 'PNB', 'Canara Bank', 'Union Bank', 'AU Bank', 'Federal Bank', 'RBL Bank',
  'Paytm', 'PhonePe', 'Google Pay', 'GPay', 'CRED', 'BHIM', 'Amazon Pay', 'Bajaj', 'Bajaj Finserv', 'Bajaj Finance', 'Bajaj Allianz', 'LIC',
  'Zerodha', 'Groww', 'Star Health', 'HDFC Ergo', 'ICICI Lombard', 'Niva Bupa', 'Care Health', 'Tata AIG', 'Acko', 'Policybazaar', 'Max Life', 'SBI Life',
  // electronics & appliances
  'Samsung', 'Apple', 'OnePlus', 'Xiaomi', 'Redmi', 'Realme', 'Vivo', 'Oppo', 'Motorola', 'Nokia', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'LG',
  'Sony', 'Whirlpool', 'Voltas', 'Godrej', 'Bosch', 'IFB', 'Haier', 'Daikin', 'Blue Star', 'Philips', 'Panasonic', 'Hitachi', 'Kent', 'Aquaguard',
  'Havells', 'Crompton', 'V-Guard', 'Prestige',
  // health
  'Apollo', 'Apollo Pharmacy', 'Fortis', 'Manipal', 'Narayana', 'Medanta', 'AIIMS', 'Kokilaben', 'Aster', 'Ruby Hall', 'Max Hospital', 'Thyrocare',
  'Metropolis', 'Redcliffe', 'SRL Diagnostics', 'Healthians', 'Practo', '1mg', 'PharmEasy', 'Netmeds',
  // employers & services
  'Infosys', 'TCS', 'Wipro', 'Accenture', 'Zoho', 'Razorpay', 'Deloitte', 'Capgemini', 'HCL', 'Freshworks', 'Cognizant', 'Tech Mahindra', 'Google',
  'Microsoft', 'IBM', 'VFS', 'UIDAI', 'EPFO', 'Passport Seva',
  // vehicles
  'Maruti', 'Maruti Suzuki', 'Hyundai', 'Honda', 'Tata Motors', 'Mahindra', 'Kia', 'Toyota', 'Renault', 'Skoda', 'Volkswagen', 'TVS', 'Royal Enfield',
  'Ola Electric', 'Ather', 'Bajaj Auto',
];

const BRAND_BY_LOWER = new Map(KNOWN_COUNTERPARTIES.map((n) => [n.toLowerCase(), n]));
/** One alternation, longest names first, so "HDFC Bank" wins over "HDFC" at the same position. */
const BRAND_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9])(${[...KNOWN_COUNTERPARTIES].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?:\.in|\.com)?(?![A-Za-z0-9])`,
  'gi',
);

/** Capitalised words that are never a company or person by themselves. */
const NOT_A_NAME = new Set([
  'I', 'The', 'A', 'An', 'My', 'Your', 'Our', 'Their', 'His', 'Her', 'He', 'She', 'They', 'We', 'You', 'It', 'This', 'That', 'These', 'Those',
  'Today', 'Tomorrow', 'Yesterday', 'Tonight', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'Customer', 'Support', 'Team', 'Dear', 'Hi', 'Hii', 'Hello', 'Hey', 'Please', 'Kindly', 'Thanks', 'Thank', 'Sorry', 'Ok', 'Okay', 'Yes', 'No', 'Reminder', 'Note', 'Update',
  'Fwd', 'Fw', 'Re', 'Bhai', 'Bhaiya', 'Yaar', 'Sir', 'Madam', 'Ji',
  'Refund', 'Order', 'Orders', 'Ordered', 'Payment', 'Payments', 'Ticket', 'Bank', 'Bill', 'EMI', 'UPI', 'Salary', 'Invoice', 'Parcel', 'Package', 'Courier', 'Delivery', 'Delivered',
  'Out', 'Got', 'Had', 'Paid', 'Lent', 'Need', 'Have', 'Has', 'Submit', 'Submitted', 'Upload', 'Called', 'Raised', 'Escalated', 'Cancelled', 'Requested', 'Received',
  'Complained', 'Filed', 'Book', 'Booked', 'Borrowed', 'Send', 'Remember', 'Rescheduled', 'Return', 'Returned', 'Wrong', 'New', 'Where', 'Is', 'Pay', 'Call',
  'Still', 'Expected', 'Interview', 'Meeting', 'Haircut', 'Dentist', 'Passport', 'Medical', 'Insurance', 'Mediclaim', 'Expense', 'Internet', 'Broadband',
  'Reimbursement', 'Manager', 'Weather', 'Flat', 'Congratulations', 'Happy', 'Shop', 'Mom', 'Dad', 'Mummy', 'Papa', 'Didi', 'Claim', 'Travel', 'Screen',
  'Driving', 'Visa', 'Dinner', 'Lunch', 'Parent', 'Salon', 'Society', 'Doctor', 'Flight', 'Dear', 'Good', 'Morning', 'Night',
  'Eye', 'Blood', 'Dental', 'Health', 'Annual', 'Full', 'Body', 'Cashless', 'Lodged', 'Sent', 'Tracking', 'Port', 'Promised', 'Got', 'Bro', 'Dude',
  // roles: a real party but not a name
  'Plumber', 'Electrician', 'Carpenter', 'Mechanic', 'Mistri', 'Technician', 'Engineer', 'Driver', 'Landlord', 'Owner', 'Tenant', 'Client', 'Vendor',
  'Seller', 'Agent', 'Office', 'College', 'School', 'University', 'Company', 'HR', 'Finance', 'Accounts', 'Admin', 'Boss', 'Friend', 'Guy',
  'Follow', 'Follow-up', 'Car', 'Service', 'SIM', 'Name', 'KYC', 'PAN', 'Aadhaar', 'NOC', 'OTP', 'Form', 'ITR', 'RTO',
  'Rs', 'INR', 'USD', 'AC', 'TV', 'LED', 'Waiting', 'Geyser', 'Fridge', 'Laptop', 'Phone', 'Electricity', 'Water', 'Gas', 'Power',
  // Hinglish words that start sentences
  'Aaj', 'Kal', 'Parso', 'Abhi', 'Mera', 'Meri', 'Mere', 'Kya', 'Haan', 'Nahi', 'Theek', 'Sab', 'Paisa', 'Paise', 'Ghar', 'Is', 'Ye', 'Yeh', 'Wo', 'Woh', 'Sale',
  // festivals
  'Diwali', 'Holi', 'Eid', 'Christmas', 'Navratri', 'Dussehra', 'Pongal', 'Onam', 'Raksha', 'Bandhan', 'Lohri',
]);

/** Words that end a name ("Dr Sharma at 5pm", "Rahul ne bola"). */
const NAME_STOP = new Set([
  'at', 'on', 'in', 'for', 'from', 'to', 'with', 'and', 'or', 'about', 'regarding', 'by', 'the', 'is', 'was', 'has', 'have', 'will', 'would',
  'said', 'told', 'promised', 'today', 'tomorrow', 'tonight', 'yesterday', 'ki', 'ka', 'ke', 'ko', 'se', 'ne', 'ji', 'sir', 'madam', 'clinic', 'hospital',
  'me', 'mein', 'pe', 'par', 'got', 'appointment', 'yesterday,',
]);
const TITLES = '(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Prof|Professor|Adv|Advocate|Shri|Smt|Sri)';
const TITLED_RE = rx(String.raw`\b${TITLES}\b\.?\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})`);

/** A capitalised name of up to three words: "Pepperfry", "Tata CLiQ", "ICICI Lombard", "redBus", "Pooja Iyer". */
const NAME = String.raw`(?:[A-Z][A-Za-z0-9&'’]*|[a-z]+[A-Z][A-Za-z0-9]*)(?: (?:[A-Z][A-Za-z0-9&'’]*))?(?: (?:[A-Z][A-Za-z0-9&'’]*))?`;

const TRAILING_DROP = new Set([
  'Today', 'Tomorrow', 'Yesterday', 'Tonight', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Rs', 'INR',
]);

function cleanName(raw: string): string | null {
  // Money and numbers are never names: "Lent Rs149 to Arjun".
  if (/^(?:rs|inr|usd)\.?[\d,]|^\d/i.test(raw)) return null;
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
  const titled = find(source, TITLED_RE);
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

const BRAND_EXT_RE = /^((?: [A-Z][A-Za-z0-9&]+){1,2})/;
const NOT_BRAND_EXT = /^(?:Service|Center|Centre|Customer|Care|Support|Hospital|Clinic|Bank)$/i;

/** Known brand, extended by following capitalised words: "ICICI" + "Lombard", "Bajaj" + "Finserv". */
function knownBrand(source: string): Party | null {
  const hit = find(source, BRAND_RE);
  if (!hit) return null;
  const canonical = BRAND_BY_LOWER.get(hit.groups[0].toLowerCase()) ?? hit.groups[0];
  const rest = source.slice(hit.index + hit.text.length);
  const ext = BRAND_EXT_RE.exec(rest);
  if (ext) {
    const words = ext[1].trim().split(' ');
    const extra = words.filter((w) => !NOT_A_NAME.has(w) && !NOT_BRAND_EXT.test(w));
    if (extra.length && extra.length === words.length) {
      const text = `${hit.text} ${extra.join(' ')}`;
      return { name: `${canonical} ${extra.join(' ')}`, evidence: text, person: false };
    }
  }
  return { name: canonical, evidence: hit.text, person: false };
}

/** "remind" -> "[Rr]emind": capitalised verbs at sentence start, while NAME stays case-sensitive. */
const anyCase = (words: string) =>
  words
    .split('|')
    .map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`)
    .join('|');

const PARTY_NOUNS =
  'order|refund|booking|package|parcel|shipment|bill|account|loan|card|app|recharge|subscription|policy|claim|cashless|approval|premium|membership|delivery|service|technician|engineer|complaint|courier|connection|workshop|garage|store|showroom|office|branch|team|hospital|support|customer care|internet|broadband|emi|credit card|appointment|interview|checkup|check-up|visit|sample|plan|meter|portal|wifi|issue|problem|ticket|request';

/** Ordered general patterns; the first that yields a real name wins. */
const PARTY_PATTERNS: Array<{ re: RegExp; person: boolean }> = [
  { re: rx(String.raw`^\s*(${NAME})\s*:`, ''), person: false }, // "Purplle: Refund of ₹2499 processed"
  { re: rx(String.raw`(?:^|[\s.!])(?:-|–|—)\s*(?:Team\s+)?(${NAME})\s*[.!]?\s*$`, ''), person: false }, // "- Team Purplle"
  { re: rx(String.raw`\bTeam (${NAME})\b`, ''), person: false },
  { re: rx(String.raw`\b(${NAME}) (?:service cent(?:er|re)|customer care|support|hospital|clinic|insurance|bank|workshop|garage|store|showroom)\b`, 'g'), person: false },
  { re: rx(String.raw`\b(?:[Mm]y|[Yy]our|[Tt]he|[Oo]ur|[Aa]n?)\s+(${NAME})\s+(?:[a-z]+\s+)?(?:${PARTY_NOUNS})\b`, 'g'), person: false }, // "your BESCOM electricity bill"
  { re: rx(String.raw`\b(${NAME})\s+ne\s+(?:kaha|bola|boli|promise|vaada)\b`, 'g'), person: true }, // "Priya ne kaha tha"
  { re: rx(String.raw`\b(${NAME})\s+(?:ka|ki|ke|ne|ko|se|wale|wali|wala)\b`, 'g'), person: false },
  { re: rx(String.raw`(?:^|[.!?,:]\s+)(${NAME})\s+(?:[a-z]+\s+)?(?:${PARTY_NOUNS}|fixed|settled|initiated|asked|delivery guy|says|said)\b`, 'g'), person: false },
  { re: rx(String.raw`\b(${NAME})\s+(?:said|says|promised|told|will|would|has (?:promised|returned|paid|not|approved|accepted|rejected|initiated|confirmed|asked|sent|refunded|cancelled)|hasn'?t|didn'?t|returned|paid back|paid|owes|asked|borrowed|gave|took|lent|bole|bola|boli)\b`, 'g'), person: true },
  { re: rx(String.raw`\b(?:${anyCase('promised|told|tell|asked|remind|called|call|text|message|lent|lend|owe|meet|visit|pay|paid|give|return')})\s+(${NAME})\b`, 'g'), person: true },
  { re: rx(String.raw`\b(?:waiting (?:on|for)|depending on)\s+(${NAME})\b`, 'g'), person: true }, // "Waiting on Tara to sign"
  { re: rx(String.raw`\b(?:from|with|to|at|by|via|on)\s+(?:the\s+)?(${NAME})\b`, 'g'), person: false }, // "with the Razorpay team"
  { re: rx(String.raw`\b(${NAME})'s\b`, 'g'), person: true },
  { re: rx(String.raw`\b(${NAME}) (?:me|mein|main|pe|par)\b`, 'g'), person: false }, // "Aster me checkup hai"
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

const SERVICE_STRONG = /\b(?:complain(?:t|ts|ed|ing)?|ticket|service request|customer care|helpline|escalat\w*|request (?:id|no|number)|request\s*#?\s*[a-z-]*\d|callback|chargeback|grievance|lodged|dispute|unauthori[sz]ed|port(?:ing)? request)\b/i;

const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ['REFUND', /\brefund(?:ed|s)?\b|\b(?:paisa|paise|paisaa) (?:wapas|vapas)\b|\bmoney (?:not )?back\b|\bcharged (?:me )?twice\b/i],
  ['REIMBURSEMENT', /\breimburse(?:ment|d)?\b|\bclaims?\b|\bmediclaim\b|\bcashless\b|\ballowance\b|\bexpense (?:portal|report|claim|sheet)s?\b|\bexpenses\b/i],
  [
    'REPAIR',
    /\b(?:repair(?:ed|ing)?|technician|service cent(?:er|re)|service station|service visit|mechanic|mistri|servicing|plumber|electrician|carpenter|engineer visit|workshop|garage|not (?:working|cooling|charging|starting|turning on)|leaking|leakage|broken|kharab|spare parts?|(?:screen|battery|display|compressor|motor|part) replacement|brakes?|puncture|making (?:a )?noise|theek (?:ho|kar)\w*)\b|\b(?:ka|ki|the|an|service) engineer\b|\bengineer (?:visit|will|would|ne|aayega|aane|is|has|came|didn'?t|hasn'?t)\b|\b(?:ka|ki|the|a|spare) parts? (?:order|ordered|aayega|aane|is|will)\b/i,
  ],
  [
    'DELIVERY',
    /\b(?:deliver(?:y|ed)?|shipped|shipping|shipment|out for delivery|dispatched|courier|parcel|package|packed|in transit|tracking|awb|return pickup|pickup|arriving|pahunch\w*|ordered|mangaya|mangwaya|order kiya|saa?man|samaan)\b|\border\b[^.\n]{0,30}\b(?:nahi aaya|not (?:yet )?(?:received|arrived)|aa jayega|arrive|still|stuck|delayed)|\b(?:received|got) (?:my|the) (?:\S+ ){0,2}order\b|\bwhere is my\b|\border (?:is )?(?:delayed|late)\b/i,
  ],
  [
    'APPOINTMENT',
    /\b(?:appointment|consultation|meeting|interview|(?:hr|technical|final|interview|managerial) round|haircut|salon|spa|check-?up|vaccination|vaccine|slot|booked for|scheduled (?:for|on|with)|bulaya hai|session|(?:blood|lab|driving|eye|medical) test|test drive|scan|x-?ray|mri|zoom call|video call|call with|demo|sample collection|(?:team )?sync|stand-?up|one-on-one|milna hai|milne (?:jana|aana) hai|mulakat|(?:ki )?booking hai|(?:doctor|dentist|dr\.? \w+) (?:ke paas|se milna|ko dikhana)|(?<!for )(?:lunch|dinner|coffee|catch-?up|party|ceremony|function) (?:with|at|on|tomorrow|today|tonight|this|next))\b|\b\d{1,2}\s*baje (?:hai|h)\b/i,
  ],
  [
    'DOCUMENT',
    /\b(?:documents?|certificates?|pan card|aadhaa?r|marksheets?|kyc|form 16|forms?|agreements?|contracts?|papers|letters?|(?:address|income|id) proofs?|noc|passport|licen[cs]e|visa|receipts?|slips?|itr|acknowledgement|fir copy|copy of|(?:invoice|bill|scanned|signed|soft|hard) copy|bank statements?|scanned|transcripts?|lease|deed|affidavit)\b/i,
  ],
  ['SERVICE_REQUEST', SERVICE_STRONG],
  [
    'PAYMENT',
    /\b(?:payment|pay|paid|transaction|upi|emi|invoice|salary|bill|bills|rent|kiraya|recharge|credit card|loan|dues|paise|paisa|bijli|fees?|premium|maintenance (?:charges?|fees?|dues|bill|of)|society maintenance|owes? me|transfer)\b/i,
  ],
  ['SERVICE_REQUEST', /\b(?:service request|request|support|broadband|internet|wifi|sim|connection|activat\w*|unfreeze|amc|issue|problem|net banking)\b/i],
  [
    'PERSONAL_PROMISE',
    /\b(?:promised|promise|will send|will share|will get back|lent|borrowed|owes?|owed|return(?:ed)? (?:my|the)|returned|get it back|give it back|given it back|gave back|give \w+(?: \w+)? back|back from|pay(?:s|ing)? (?:me |him |her |them )?back|paid back|de dega|de degi|wapas (?:kar|le|de|lena|dena|karna|karne)\w*|lautana|lauta\w*|udhaa?r|vaada|ne (?:kaha|bola|boli) (?:tha|thi|hai)|told \w+(?: \w+)? I|I'?d (?:call|send)|confirm|drop off)\b|\b(?:said|says|told me|bole|bola|boli)\b[^.\n]{0,25}\b(?:will|would|'ll|denge|dega|degi)\b|'s \w+ (?:by|on|tomorrow|today)|\b(?:return|give back|lautana)\s+[A-Z]\w*(?: [A-Z]\w*)?'s\b/i,
  ],
];

// ------------------------------------------------------------------ status signals

const INFORMATIONAL = /\b(?:otp|one[- ]time password|verification code|\d+% off|flat \d+%|sale|offer ends|offers? available|newsletter|unsubscribe|congratulations|you have won|happy (?:diwali|holi|new year|birthday|independence)|thank you for shopping|statement (?:is|for)|now available|password was changed|weather update|top picks|how are you|long time no see|used \d+% of|avl\.? bal|available balance|debited from your (?:a\/c|account)|(?:notes|minutes|files?) (?:from \w+ )?(?:are |is )?attached|for (?:your )?reference|good morning|good night|membership has been renewed|trip receipt|new login|has been placed|thanks for rating|supply will be (?:interrupted|disrupted|off)|power cut|outage|scheduled maintenance|will be unavailable|downtime|pre-?approved|you have been selected|apply now|click (?:here|the link)|limited (?:time|period) offer|shubhkamna\w*|hardik)\b/i;

/** Service notices are information even though they use future tense ("supply will be interrupted"). */
const NOTICE = /\b(?:supply will be (?:interrupted|disrupted|off)|power cut|outage|scheduled maintenance|will be unavailable|downtime|services? will be (?:down|affected))\b/i;

/** Hinglish future tense: "de dega", "bhej dega", "ho jayega", "aayega", "karenge". */
const HI_FUTURE = String.raw`dega|degi|denge|dunga|dungi|bhejega|bhejegi|bhejenge|karega|karegi|karenge|hoga|hogi|honge|aayega|aayegi|aayenge|ayega|ayegi|milega|milegi|milenge|batayega|batayegi|batayenge|lautayega|lautayegi|jayega|jayegi|jayenge|aane wala|aane wali|aane wale`;

/** Things still open. "Strong" signals beat a completion word or an informational look. */
const STRONG_PENDING = rx(
  String.raw`\b(?:not (?:yet )?(?:received|credited|arrived|reflected|delivered|resolved|returned|paid|fixed|working|done|attended|showing|shared|cooling|charging|approved|processed|back)|(?:he|she|they)'d|on hold|never (?:received|got|arrived|came|delivered|reached)|haven'?t|hasn'?t|has not|didn'?t (?:show up|come|turn up|call|arrive|reply|respond|get|receive)|did not (?:show up|come|call|receive)|yet to|still|pending|awaiting|waiting|supposed to|no (?:\w+ )?(?:update|response|reply|news|call)(?: yet)?|due|owes?|(?:will|would|'ll|shall) (?:be )?[a-z]+|promised|where is my|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili|hua|hui|pahuncha|pahunchi|bheja|bheji|diya|diye|di|kiya|kiye|ki|ho raha|ho rahi|mil raha|mil rahi|aa raha|aa rahi|chal raha|chal rahi)|aaya hi nahi|aayi hi nahi|koi (?:action|response|reply|update|jawab) nahi|abhi tak|ab tak|abhi bhi|band (?:hai|pada|ho gay[ai])|kharab|${HI_FUTURE}|ho jayega|ho jayegi|ho jayenge|aa jayega|aa jayegi|missing|damaged|defective|wrong item|kar denge|kar dega|bhejenge)\b`,
);
const WEAK_PENDING = rx(
  String.raw`\b(?:initiated|submitted|raised|registered|scheduled|booked|expected|estimated|lodged|may take|in (?:process|progress)|under (?:process|review|processing)|stuck|delayed|shipped|dispatched|out for delivery|in transit|arriving|approved|payout|down since|lent|get it back|confirmed for|requested|fixed for|moved to|rescheduled|expires?|(?:request|complaint) (?:daali|dali|ki|kiya|kari|di)|daali hai|dali hai)\b`,
);
const COMPLETED = rx(
  String.raw`\b(?:credited|received|processed|completed|delivered|resolved|closed|fixed(?! for| on| at)|repaired|replaced|returned|refunded|settled|paid back|paid|gave back|given back|done|successful|successfully|collected|handed back|verified|works fine|working fine|sorted|all good|all fine|went well|aa gaya|aa gayi|aa gaye|mil gaya|mil gayi|mil gaye|ho gaya|ho gayi|ho gaye|ho chuka|ho chuki|got (?:my|the|it)|had my (?:appointment|meeting|interview|consultation)|attended|went for|went well|(?:is|are|now) complete|kat gay[ai]|katt? gay[ai]|wapas (?:kar|de) diy[ae]|lauta diy[ae]|(?:submit|jama|pay|transfer|reimburse|refund|credit|return|repair|fix|solve|resolve|settle|clear|close) kar (?:diy[ae]|di)|bhar diy[ae]|bhej diy[ae]|mil liy[ae]|pahunch gay[ai]|pohoch gay[ai]|(?:got|get) (?:my|the|it) (?:\w+ ){0,3}back)\b`,
);
/** "not delivered", "will be credited", "hasn't returned", "to be paid" are not completions. */
// Contractions only: "hasn't"/"hasnt" — not the "nt" at the end of "complaint" or "payment".
const NEGATED_BEFORE =
  /(?:\bnot|\b\w+n't|\b(?:hasnt|havent|hadnt|didnt|doesnt|dont|wont|isnt|wasnt|arent|werent|cant|couldnt|wouldnt|shouldnt)|\bnever|\byet to|\bwill|\bwould|\bto be|\bbe|\bexpected to|\bshould|\bshall|\bonce|\bif|\bwhen|\buntil|\bbefore)\s+(?:\w+\s+){0,2}$/i;
/** "kharab ho gaya" (broke down), "band ho gayi" (stopped working) are problems, not completions. */
const BROKE_BEFORE = /\b(?:kharab|kharaab|band|kho|chori|fail|cancel|block|hang|crash|leak|bigad|kat|dead)\s*$/i;

function completionHit(text: string): Hit | null {
  for (const hit of findAll(text, COMPLETED)) {
    const before = text.slice(Math.max(0, hit.index - 30), hit.index);
    if (NEGATED_BEFORE.test(before)) continue;
    if (/^ho /i.test(hit.text) && BROKE_BEFORE.test(before)) continue;
    return hit;
  }
  return null;
}

/** An appointment that was called off: nothing left to attend. */
const CANCELLED = /\b(?:cancel(?:l)?ed|called off|cancel ho gay[ai])\b/i;

/** The user has to act: to-dos, bills they owe, their own promises. */
// "need to / have to / must + any verb" is a to-do; "please/kindly" only with real task verbs ("Please rate us" is not).
const USER_VERBS = 'submit|upload|send|provide|share|pay|complete|sign|bring|collect|pick up|get|update|renew|return|visit|book|attend|fill|call|apply|file|link|verify|carry|deposit|transfer|reply|email|meet|go|confirm';
const USER_ACTION = rx(
  String.raw`\b(?:i |you |we )?(?:need to|needs to|have to|has to|must|got to|should|remember to|don'?t forget to) (?:be )?[a-z]+\b${SC}{0,60}|\b(?:please|kindly) (?:${USER_VERBS})\b${SC}{0,60}|\bneed (?:a |the |my )?(?:\w+ )?(?:sign-?off|approval|signature)\b${SC}{0,40}`,
);
const GREETING = String.raw`(?:(?:hi|hello|hey|fwd|fw|bhai|yaar|dear|reminder(?: to self)?|note(?: to self)?|to-?do)(?: sir| madam| bhai)?[,:!-]?\s+){0,2}`;
const USER_IMPERATIVE = rx(
  String.raw`^\s*${GREETING}(?:please |kindly |pls |plz )?(?:submit|upload|send|share|pay|bring|fill|complete|sign|return|collect|renew|apply|file|book|call|email|attend|visit|update|carry|buy|check|take|get|chase|follow up|ask)\b${SC}{0,60}`,
);
// Hinglish obligation "X-na hai" (bharna hai, lautana hai, upload karne hain); not "aana/hona/milna hai", which
// usually means something is to arrive/happen — except "X se milna hai" (meet X).
const USER_OWES = rx(
  String.raw`\b(?:bill|bills|emi|rent|premium|dues?|fees?|installment|credit card(?: payment| bill)?|loan|payment|maintenance)\b${SC}{0,40}\b(?:is |are )?due\b(?! from)|\b(?:need to|have to|must|got to|should) pay\b|\bto be paid\b|\bhas to be (?:paid|submitted|done|sent|filed)\b|(?<!\b(?:will|would|shall|'ll|to) )\bpay (?:by|before)\b|\bdue date\b|\blast date\b|\b(?!(?:aa|ho|mil|a)n[ae]\b)[a-z]+(?:na|ne) hai[n]?\b|\bse milna hai\b|\b(?:needs?|wants?|asked for|maanga|maangi|mangaya) (?:a |the |my |more )?(?:copy|copies|proof|documents?|details|papers)\b|^\s*(?:I )?owe [A-Z]|\bpay (?:him|her|them) back\b`,
);
const USER_PROMISE = rx(String.raw`\bI\s+(?:promised|told|assured|committed)\b|^\s*promised\b|\btold \w+(?: \w+)? I\b|\bI(?:'d| would| will|'ll) [a-z]+\b`);
/** Someone owes the user money or a thing. */
const OTHER_OWES = rx(
  String.raw`\bowes? me\b|\b(?:hasn'?t|has not|didn'?t|did not|not) (?:yet )?paid\b|\bpay(?:s)? (?:me )?back\b|\bwill pay\b|\bsalary\b|\bget it back\b|\bde dega\b|\bde degi\b|\breversal\b|\bnot (?:yet )?(?:received|credited)\b|\bhasn'?t (?:given|returned)\b|\b(?:payment|paise|paisa|amount)\b${SC}{0,25}\b(?:nahi|nhi) (?:kiya|kiye|diya|diye|di|mila|mili|aaya|aayi)\b|\budhaa?r (?:diye|diya|di) (?:the|tha|thi)\b|\bwapas nahi (?:kiye|kiya|ki|diye|diya)\b|\b(?:money|amount) (?:got |was |has been )?(?:deducted|debited)\b`,
);

// ------------------------------------------------------------------ amounts

/** "10k", "1.5 lakh", "2 crore": multiplier words parseAmount() understands. */
const MULTIPLIER = String.raw`(?:\s?(?:k|thousand|hazaa?r|lakhs?|lacs?|crores?|cr)\b)?`;
const NUMBER_VALUE = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
const AMOUNT_CURRENCY_FIRST = rx(String.raw`(₹|\brs\.?|\binr\b)\s*(${NUMBER_VALUE}${MULTIPLIER})(?!\s*(?:days?|din|hours?|weeks?|months?|%))`);
const AMOUNT_CURRENCY_AFTER = rx(String.raw`\b(${NUMBER_VALUE}${MULTIPLIER})\s?(rupees|rupaye|rupay|rs\.?|inr)\b`);
/** 2-7 digit amounts, optionally grouped (1,00,000 / 12,500) or with paise; avoids long IDs. */
const MONEY_NUMBER = String.raw`(?:\d{1,3}(?:,\d{2,3})+|\d{2,7})(?:\.\d{1,2})?`;
const MONEY_WORDS = 'refund|refunded|payment|paid|cashback|bill|bills|amount|reimbursement|deposit|fees?|salary|emi|charges?|paise|paisa|rupaye|rupay|rent';
const AMOUNT_FILLERS = '(?:ka|ki|ke|of|worth|wala|wali|the|my|bijli|electricity|phone|mobile|internet|water|gas|travel|medical|office|total)';
const AMOUNT_BARE_BEFORE = rx(String.raw`\b(${MONEY_NUMBER}${MULTIPLIER})\s+(?:${AMOUNT_FILLERS}\s+){0,3}(?:${MONEY_WORDS})\b`);
const AMOUNT_BARE_AFTER = rx(String.raw`\b(?:${MONEY_WORDS})\s+(?:(?:of|ka|ki|ke|amount|for)\s+){0,2}(${MONEY_NUMBER}${MULTIPLIER})\b(?!\s*(?:days?|din|hours?|weeks?|%))`);

// ------------------------------------------------------------------ dates

const NUMBER_WORD = '(?:\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';
const HI_NUMBER = '(?:\\d{1,3}|ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|nau|das|pandrah|bees)';
const TIME_OF_DAY = String.raw`\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?)`;
const WEEKDAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DAY_WORD = `(?:day after tomorrow|tomorrow|today|tonight|(?:on |this |next )?${WEEKDAY}|(?:on )?\\d{1,2}(?:st|nd|rd|th)? ${MONTH}|(?:on )?${MONTH} \\d{1,2}(?:st|nd|rd|th)?)`;
const HI_PART = '(?:subah|savere|shaam|sham|dopahar|raat)';
const DEADLINE_RULES: Array<[RegExp, 'EXPLICIT' | 'ESTIMATED']> = [
  // "at 2 p.m tomorrow", "tomorrow at 2pm", "on Friday at 10:30 am", "at 6pm on Nov 25"
  [rx(String.raw`\b(?:at |by )?${TIME_OF_DAY}\s+(?:on\s+)?${DAY_WORD}\b|\b${DAY_WORD}\s+(?:at |by )?${TIME_OF_DAY}`), 'EXPLICIT'],
  // "kal shaam 5 baje", "Monday ko subah 10 baje"
  [rx(String.raw`\b(?:kal|parso|aaj|${WEEKDAY})(?: ko)?\s+(?:${HI_PART}\s+)?\d{1,2}\s*baje\b`), 'EXPLICIT'],
  [rx(String.raw`\b${NUMBER_WORD} ?(?:-|to|–) ?${NUMBER_WORD} (?:business |working )?(?:days?|weeks?)\b`), 'ESTIMATED'],
  [rx(String.raw`\b(?:within|in|next|after|takes?|said|around|about|inside)\s+${NUMBER_WORD} (?:business |working )?(?:days?|hours?|weeks?|months?)\b`), 'ESTIMATED'],
  [/\b(?:in|within) (?:a )?(?:couple of|few) (?:days|weeks)\b|\bin the next few days\b/i, 'ESTIMATED'],
  // Hinglish durations need "me/tak/ke andar": "15 din ho gaye" and "4 din se" are elapsed time, not deadlines.
  [rx(String.raw`\b${HI_NUMBER}(?: ?(?:-|se) ?${HI_NUMBER})? (?:din|dino|hafte|hafton|mahine)(?: ke andar| me| mein| main| tak| lagenge| lag jayenge| baad)\b`), 'ESTIMATED'],
  [/\b(?:next week|this week|next month|end of (?:the |this )?(?:week|month)|(?:before |by |till )?(?:the )?month[- ]?end|next cycle|agle (?:hafte|mahine)|hafte bhar(?: me| mein)?|mahine ke (?:end|aakhir|akhir) (?:tak|me|mein))\b/i, 'ESTIMATED'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, 'EXPLICIT'],
  [rx(String.raw`\b\d{1,2}(?:st|nd|rd|th)? (?:of )?${MONTH}(?: \d{4})?\b`), 'EXPLICIT'],
  [rx(String.raw`\b${MONTH} \d{1,2}(?:st|nd|rd|th)?\b(?!\s*(?:days?|%|hours?))`, 'i'), 'EXPLICIT'],
  [/\b(?:on|by|before|till|until) (?:the )?\d{1,2}(?:st|nd|rd|th)\b|\b\d{1,2} tarikh(?: tak| ko)?\b/i, 'EXPLICIT'],
  [rx(String.raw`\b(?:by|before|on|this|next|coming|for|till|until|to|is) ${WEEKDAY}\b|\b${WEEKDAY} (?:tak|ko)\b`), 'EXPLICIT'],
  [rx(String.raw`\b(?:day after tomorrow|tomorrow|by (?:the )?evening|by end of day|by eod|tonight|kal tak|parso tak|(?:aaj|kal|parso)(?: ko)? ${HI_PART}(?: tak| ko)?)\b`), 'EXPLICIT'],
];
const EVENT_RULE = /\b(day before yesterday|yesterday|last (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i;
/** "initiated my refund on 2 Nov" describes the past, not a deadline. */
const PAST_CONTEXT = /\b(?:initiated|placed|ordered|submitted|raised|filed|paid|bought|purchased|cancelled|returned|gave|given|had|was|were|happened|delivered|received|came|went|started|applied)\b/i;
const FUTURE_CUE = /\b(?:will|by|due|expected|scheduled|booked|confirmed|for|till|until|before|next|tak|should|must|need|to be|has to|have to|going to)\b/i;
/** Bank/receipt wording that always describes the past: "credited ... on 09-11-2026", "down since on 2 Nov". */
const PAST_STRONG = /\b(?:credited|debited|deducted|receipt|since|statement)\b/i;
const FUTURE_STRONG = /\b(?:will|would|be|expected|shall|should|to)\b/i;

function findDeadline(text: string): Extraction['deadline'] {
  for (const [re, kind] of DEADLINE_RULES) {
    for (const hit of findAll(text, re)) {
      if (kind === 'EXPLICIT' && !/^(?:by|before|till|until)\b/i.test(hit.text)) {
        // Look back to the start of this sentence (up to 70 chars; "Rs.1299.00" is not a sentence end).
        const before = text.slice(Math.max(0, hit.index - 70), hit.index).split(/[!?\n]|\.\s(?=[A-Z])/).pop() ?? '';
        if (PAST_STRONG.test(before) && !FUTURE_STRONG.test(before)) continue;
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

const STAGE_REFUND_INITIATED = rx(
  String.raw`\b(?:refund${SC}{0,40}(?:initiated|pending|processing|expected)|initiated${SC}{0,40}refund|not (?:yet )?(?:received|credited|reflected)|(?:haven'?t|hasn'?t) (?:received|got)${SC}{0,20}|refund${SC}{0,30}(?:aane wala|aane wali|aayega|aayegi)|(?:nahi|nhi|nahin|nai) (?:aaya|aya|aayi|aai|mila|mili)|(?:claim|reimbursement)${SC}{0,40}(?:pending|under process|filed|submitted|approved))`,
);
const STAGE_PAYMENT_FAILED = rx(String.raw`\b(?:payment|transaction)${SC}{0,30}(?:failed|declined|unsuccessful)\b`);
const STAGE_PAYMENT_PENDING = rx(
  String.raw`\b(?:payment|transaction|bill|invoice|salary|emi|rent|credit card)${SC}{0,40}(?:pending|due|not received|awaiting|processing)\b|\b(?:pending|due) (?:payment|amount)\b|\bhasn'?t paid\b|\bowes me\b`,
);
const STAGE_DOC_AWAITED = rx(String.raw`\b(?:will (?:send|share|issue)|waiting for|awaiting|requested|promised to)${SC}{0,40}`);
const STAGE_REQUEST_SUBMITTED = rx(
  String.raw`\b(?:(?:gave|given|dropped(?: off)?|handed(?: over)?|left|sent|took|taken|submitted)\b${SC}{0,30}\bfor (?:\w+ )?(?:repair|service|servicing|replacement)|(?:submitted|raised|registered|created|logged|escalated)\b${SC}{0,40}|complaint (?:number|no|id)${SC}{0,20})`,
);
const STAGE_DELIVERY_PENDING = /\b(?:shipped|out for delivery|dispatched|will be delivered|not (?:yet )?delivered|arriving|in transit|expected delivery)\b[^.\n]{0,30}/i;
const STAGE_APPOINTMENT = /\b(?:appointment|consultation|meeting|interview|booked|scheduled|bulaya)\b[^.\n]{0,40}/i;

const IDENTIFIER_RE = /\b(order|ref(?:erence)?|ticket|complaint|sr|service request|request|transaction|txn|utr|awb|tracking)\s*(?:id|no\.?|number|#)?\s*(?:is\s*)?[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/gi;
const PERSON_FUTURE = /\b(?:will|would|'ll|promised|ne bola|bola tha|said|says|ne kaha)\b/i;

export function mockExtract(text: string): Extraction {
  const uncertainties: string[] = [];

  // Company / person
  const party = findParty(text);
  const counterparty: Extraction['counterparty'] = party ? { name: party.name, evidence: party.evidence } : null;

  // Category: brand names are masked first, so "Google Pay" or "Tata Power" don't read as "pay"/"power".
  const forCategory = text.replace(BRAND_RE, (m) => m.replace(/[A-Za-z0-9+]/g, 'X'));
  let category: Category | null = null;
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(forCategory)) {
      category = cat;
      break;
    }
  }
  // "Meera will drop off the drill", "Rahul ne bola tha ..." — a named person's promise.
  if (!category && party?.person && PERSON_FUTURE.test(text)) category = 'PERSONAL_PROMISE';

  // Amount
  let amount: Extraction['amount'] = null;
  // "₹2,499" and "2499 INR" are both fine; when both shapes match, the one that starts first is the amount
  // ("2499 INR 3 days back" is ₹2,499, not "INR 3").
  const before = find(text, AMOUNT_CURRENCY_FIRST);
  const after = find(text, AMOUNT_CURRENCY_AFTER);
  if (after && (!before || after.index < before.index)) amount = { value: after.groups[0].trim(), currency: 'INR', evidence: after.text };
  else if (before) amount = { value: before.groups[1].trim(), currency: 'INR', evidence: before.text };
  else {
    // A bare number next to a money word: "500 ka refund", "refund of 1,200", "371 ka bijli bill".
    // No currency is written, so none is claimed (validation adds "Currency not stated").
    const bare = find(text, AMOUNT_BARE_BEFORE) ?? find(text, AMOUNT_BARE_AFTER);
    if (bare) amount = { value: bare.groups[0].trim(), currency: /rupaye|rupay/i.test(bare.text) ? 'INR' : null, evidence: bare.text };
  }

  // Identifiers
  const identifiers: Extraction['identifiers'] = [];
  for (const hit of findAll(text, IDENTIFIER_RE)) {
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
  let done = strongPending ? null : completionHit(text);
  if (!done && !strongPending && category === 'APPOINTMENT' && !/\breschedul/i.test(text)) {
    const cancelled = find(text, CANCELLED);
    if (cancelled) done = cancelled;
  }

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
      stage('REFUND_INITIATED', STAGE_REFUND_INITIATED);
      break;
    case 'PAYMENT':
      stage('PAYMENT_FAILED', STAGE_PAYMENT_FAILED);
      if (done) stage('PAYMENT_SUCCESS', done);
      stage('PAYMENT_PENDING', STAGE_PAYMENT_PENDING);
      break;
    case 'DOCUMENT':
      if (done) stage('OTHER', done);
      stage('DOC_TO_SUBMIT', USER_ACTION);
      stage('DOC_TO_SUBMIT', USER_IMPERATIVE);
      stage('DOC_AWAITED', STAGE_DOC_AWAITED);
      break;
    case 'REPAIR':
    case 'SERVICE_REQUEST':
      if (done) stage('REQUEST_RESOLVED', done);
      stage('REQUEST_SUBMITTED', STAGE_REQUEST_SUBMITTED);
      break;
    case 'DELIVERY':
      if (done) stage('DELIVERED', done);
      stage('DELIVERY_PENDING', STAGE_DELIVERY_PENDING);
      break;
    case 'APPOINTMENT':
      if (done) stage('OTHER', done);
      stage('APPOINTMENT_SCHEDULED', STAGE_APPOINTMENT);
      break;
    default:
      break;
  }
  const stageValue = lifecycleStage as Extraction['lifecycleStage'];

  // Who acts next, and is it still open?
  const userAction = find(text, USER_ACTION) ?? find(text, USER_IMPERATIVE);
  const userOwes = USER_OWES.test(text);
  const userPromise = USER_PROMISE.test(text);
  const userSignal = Boolean(userAction || userOwes || userPromise);
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
  } else if (userSignal && !(otherOwes && !userOwes && !userPromise && !userAction)) {
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
  // Money with no other clue ("Sanjana hasn't sent the ₹7,999", "maine ₹500 bhej diye") is a payment. Only a
  // label for things already trackable or done: it never turns an unclear message into a case.
  if ((isCommitment || classification === 'COMPLETED') && !category && amount) category = 'PAYMENT';

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
    return { raw: mockExtract(req.text), provider: this.name, model: 'rules-v3', promptVersion: 'mock-v3' };
  }
}
