/**
 * Well-known Indian brands, and the other ways they get written — mostly by speech-to-text ("FlipCart",
 * "Phone Pay", "Big Basket"). Used by the offline extractor to recognise companies, and by validation to accept
 * a company name whose known spelling variant is what the text actually says.
 *
 * Only add variants that are not ordinary words ("mantra" is never Myntra).
 */
export const KNOWN_BRANDS = [
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

/** Other spellings -> brand. Lowercase keys; spaces match any whitespace. */
export const BRAND_ALIASES: Record<string, string> = {
  flipcart: 'Flipkart', 'flip cart': 'Flipkart', 'flip kart': 'Flipkart',
  mintra: 'Myntra', myntraa: 'Myntra',
  'blink it': 'Blinkit', blinket: 'Blinkit', blinkitt: 'Blinkit',
  meeshow: 'Meesho', 'mee sho': 'Meesho',
  nyka: 'Nykaa', nykka: 'Nykaa',
  swiggi: 'Swiggy', swigy: 'Swiggy',
  zomatto: 'Zomato',
  'insta mart': 'Instamart',
  'big basket': 'BigBasket',
  'jio mart': 'JioMart', 'jio fiber': 'JioFiber', 'jio fibre': 'JioFiber',
  'snap deal': 'Snapdeal',
  'lens kart': 'Lenskart', lenscart: 'Lenskart', 'lens cart': 'Lenskart',
  'first cry': 'FirstCry',
  'tata click': 'Tata CLiQ', 'tata cliq': 'Tata CLiQ',
  'urban clap': 'Urban Company', urbanclap: 'Urban Company',
  'make my trip': 'MakeMyTrip',
  'go ibibo': 'Goibibo', goibhibo: 'Goibibo',
  'red bus': 'redBus',
  'ease my trip': 'EaseMyTrip',
  'phone pe': 'PhonePe', 'phone pay': 'PhonePe', phonepay: 'PhonePe',
  'g pay': 'GPay', 'gee pay': 'GPay',
  'pay tm': 'Paytm', paytem: 'Paytm', 'pay t m': 'Paytm',
  'one plus': 'OnePlus',
  'air tel': 'Airtel',
  'i r c t c': 'IRCTC',
  'h d f c': 'HDFC', 'h d f c bank': 'HDFC Bank',
  'i c i c i': 'ICICI', 'i c i c i bank': 'ICICI Bank',
  's b i': 'SBI',
  'tata sky': 'Tata Play',
  'dee mart': 'DMart', 'd mart': 'DMart',
  'pharm easy': 'PharmEasy',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spaced = (s: string) => escapeRe(s).replace(/ /g, '\\s+');

/** lowercase spelling (brand or alias, spaces collapsed) -> canonical brand */
export const CANONICAL_BRAND = new Map<string, string>([
  ...KNOWN_BRANDS.map((n) => [n.toLowerCase(), n] as [string, string]),
  ...Object.entries(BRAND_ALIASES),
]);

/** One alternation over every spelling, longest first, so "HDFC Bank" wins over "HDFC" at the same position. */
export const BRAND_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9])(${[...CANONICAL_BRAND.keys()].sort((a, b) => b.length - a.length).map(spaced).join('|')})(?:\.in|\.com)?(?![A-Za-z0-9])`,
  'gi',
);

export function canonicalBrand(spelling: string): string | undefined {
  return CANONICAL_BRAND.get(spelling.toLowerCase().replace(/\s+/g, ' '));
}

/** Canonical brands whose known spelling appears in the text ("FlipCart" -> Flipkart). */
export function brandsMentioned(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(BRAND_RE)) {
    const c = canonicalBrand(m[1]);
    if (c) out.add(c.toLowerCase());
  }
  return out;
}

// ------------------------------------------------------------------ near-miss spellings (speech-to-text)

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Brands that are, or sit one letter away from, everyday words: never guessed from a near-miss. */
const NO_FUZZY = new Set(['apple', 'aster', 'ather', 'porter', 'prestige', 'lifestyle', 'westside', 'kotak', 'philips', 'manipal', 'honda', 'google', 'yatra', 'acko', 'bajaj', 'oppo', 'vivo', 'redmi', 'realme', 'lenovo', 'nokia', 'croma']);
/** Everyday words that are a letter or two away from a brand. */
const NOT_A_BRAND = new Set([
  'apply', 'other', 'after', 'faster', 'easter', 'poster', 'master', 'sister', 'mister', 'manual', 'mantra', 'mentor', 'rapid', 'rapids',
  'kodak', 'phillips', 'water', 'later', 'order', 'offer', 'centre', 'center', 'letter', 'better', 'matter', 'member', 'number', 'summer',
  'winner', 'dinner', 'zombie', 'swing', 'meeting', 'messages', 'dealer', 'retail', 'travel', 'tomato', 'tomatoes', 'purple', 'blanket',
  'pathway', 'adventure', 'excited', 'voters', 'grown', 'growth', 'rental', 'portal', 'mortal', 'sample', 'simple', 'temple', 'people',
  'plenty', 'twenty', 'thirty', 'eighty', 'ninety', 'friday', 'sunday', 'monday', 'tuesday', 'mailbox', 'payment', 'parent', 'patent',
]);

const FUZZY_TARGETS = KNOWN_BRANDS.filter((b) => squash(b).length >= 5 && !NO_FUZZY.has(squash(b))).map((b) => ({ brand: b, key: squash(b) }));

/** Levenshtein distance, giving up once it is certainly above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The brand a word is probably a speech-to-text misspelling of: "Mentra" -> Myntra, "Geomart" -> JioMart,
 * "SnapDial" -> Snapdeal, "Rappado" -> Rapido. One letter of slack, two when both words are long (6+ and 7+ letters).
 * Only used where the text already reads like a company name (see the extractor) and checked by validation.
 */
export function nearBrand(spelling: string): string | undefined {
  const exact = canonicalBrand(spelling);
  if (exact) return exact;
  const s = squash(spelling);
  if (s.length < 5 || NOT_A_BRAND.has(s)) return undefined;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const { brand, key } of FUZZY_TARGETS) {
    const max = Math.max(s.length, key.length) >= 7 && Math.min(s.length, key.length) >= 6 ? 2 : 1;
    const d = distance(s, key, max);
    if (d <= max && d < bestDistance) {
      best = brand;
      bestDistance = d;
    }
  }
  return best;
}

/** True when `evidence` (verbatim from the text) is `name` or a recognised spelling of the brand `name`. */
export function isBrandSpelling(evidence: string, name: string): boolean {
  const brand = nearBrand(evidence);
  return Boolean(brand && brand.toLowerCase() === name.trim().toLowerCase());
}
