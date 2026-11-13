// LifeLoop large evaluation set: up to 100,000 English + Hinglish messages.
//
// Messages are composed from ~250 sentence templates (written independently of the 1,000-message set)
// × slot values (companies, people, amounts in many formats, English/Hinglish time phrases) × WhatsApp-style
// noise (lowercase, missing punctuation, emojis, "Hi sir," prefixes, extra spaces).
//
// Honest measurement: every 4th template per category is a TEST template. Rules are tuned only on failures
// from DEV templates; TEST shows whether the fixes generalise to sentence shapes the tuning never saw.
//
// Labels (same as dataset.mjs): undefined = not checked, null = must be empty (hallucination check).

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ slot values
const SHOPS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Swiggy', 'Zomato', 'BigBasket', 'Blinkit', 'Zepto', 'Croma', 'Decathlon', 'IKEA', 'Lenskart', 'Pepperfry', 'Tata CLiQ', 'FirstCry', 'Purplle', 'Snapdeal', 'JioMart', 'Reliance Digital', 'Vijay Sales', 'Mamaearth', 'Shopsy', 'Instamart', 'Urban Ladder', 'Bewakoof'];
const TRAVEL = ['IRCTC', 'MakeMyTrip', 'Goibibo', 'IndiGo', 'Air India', 'Uber', 'Ola', 'Rapido', 'redBus', 'Cleartrip', 'Yatra', 'EaseMyTrip', 'SpiceJet', 'Akasa Air', 'OYO'];
const TELCOS = ['Airtel', 'Jio', 'Vi', 'BSNL', 'Tata Play', 'ACT Fibernet', 'Hathway', 'Excitel', 'JioFiber', 'Airtel Xstream'];
const UTILITIES = ['BESCOM', 'Tata Power', 'Adani Electricity', 'BSES', 'Mahanagar Gas', 'Indane', 'MSEDCL', 'Torrent Power'];
const BANKS = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak', 'Paytm', 'PhonePe', 'Bajaj Finserv', 'Yes Bank', 'IDFC First', 'IndusInd', 'CRED', 'Google Pay'];
const BRANDS = ['Samsung', 'Apple', 'OnePlus', 'Xiaomi', 'Dell', 'HP', 'Lenovo', 'LG', 'Whirlpool', 'Sony', 'Asus', 'Voltas', 'Godrej', 'Bosch', 'IFB', 'Haier', 'Daikin', 'Blue Star', 'Philips', 'Realme', 'Acer', 'Kent', 'Aquaguard'];
const ITEMS = ['laptop', 'phone', 'AC', 'washing machine', 'fridge', 'TV', 'tablet', 'microwave', 'geyser', 'water purifier', 'chimney', 'inverter', 'printer', 'cooler'];
const HOSPITALS = ['Apollo', 'Fortis', 'Manipal', 'Max', 'Narayana', 'Medanta', 'Kokilaben', 'Aster', 'Ruby Hall'];
const LABS = ['Thyrocare', 'Metropolis', 'Redcliffe', 'SRL Diagnostics', 'Healthians'];
const INSURERS = ['Star Health', 'HDFC Ergo', 'ICICI Lombard', 'Niva Bupa', 'Care Health', 'Bajaj Allianz', 'Tata AIG', 'LIC'];
const COMPANIES = ['Infosys', 'TCS', 'Accenture', 'Zoho', 'Razorpay', 'Wipro', 'Deloitte', 'Capgemini', 'HCL', 'Freshworks', 'Paytm', 'Swiggy'];
const CARS = ['Maruti', 'Hyundai', 'Honda', 'Tata Motors', 'Mahindra', 'Kia', 'Toyota'];
const PEOPLE = ['Rahul', 'Priya', 'Amit', 'Neha', 'Rohan Mehta', 'Sneha', 'Vikram', 'Anjali', 'Karan', 'Pooja Iyer', 'Arjun', 'Kavya', 'Siddharth', 'Ishaan', 'Meera', 'Aditya', 'Riya', 'Manish', 'Deepak', 'Sunita', 'Ravi Kumar', 'Nikhil', 'Tanvi', 'Harsh', 'Shreya', 'Yash', 'Divya', 'Gaurav', 'Ankit', 'Simran', 'Farhan', 'Joseph', 'Lakshmi'];
const DOCTORS = ['Sharma', 'Mehta', 'Iyer', 'Reddy', 'Khan', 'Gupta', 'Nair', 'Kapoor', 'Banerjee', 'Joshi', 'Rao', 'Verma'];
const THINGS = ['book', 'charger', 'headphones', 'camera', 'bike', 'notes', 'power bank', 'speaker', 'drill machine', 'umbrella', 'tripod', 'calculator'];
const PAST = ['yesterday', 'last week', 'on Monday', 'two days ago', 'last Friday', 'on 2 Nov', '3 days back', 'last month'];
const MONTHS = ['September', 'October', 'August'];
const TICKETS = ['SR123456', 'TKT-88213', 'CMP4471920', '#45821', 'REQ-2026-0911', 'C-99812', 'INC0045521'];
const ORDERS = ['403-1234567-7654321', 'OD12345678901', '#782341', 'ORD99120', 'FN2290011'];
const ISSUES = ['slow internet', 'wrong billing', 'no network', 'frequent disconnections', 'double charge', 'a failed recharge'];

// Time phrases. Every phrase in a list has the kind of the list.
const EX_EN = ['by Friday', 'on Monday', 'tomorrow', 'by 20 Nov', 'on 15/11/2026', 'by 25th November', 'day after tomorrow', 'by Saturday', 'before Thursday', 'by tomorrow evening', 'this Saturday', 'next Monday', 'on the 25th', 'by end of day', 'tonight', 'by 30th Nov', 'on 1st December', 'before 20 Nov', 'by Nov 28', 'on Dec 2'];
const EST_EN = ['within 3 days', 'in 5-7 business days', 'within a week', 'next week', 'in 2 weeks', 'within 48 hours', 'in 7-10 working days', 'within 24 hours', 'in 3-4 days', 'within 15 days', 'in a month', 'by end of this month', 'within 10 working days', 'in a couple of days', 'in a few days'];
const EX_HI = ['kal tak', 'parso tak', 'Friday tak', 'Monday ko', '20 Nov tak', 'aaj shaam tak', 'kal subah tak', 'Sunday tak', '25 tarikh tak', 'kal shaam 6 baje tak', 'is Saturday tak'];
const EST_HI = ['2 din me', '3-4 din me', 'ek hafte me', '5 din mein', 'agle hafte', '10 din me', '2-3 din me', 'do din me', 'teen din me', 'hafte bhar me', 'mahine ke end tak', 'agle mahine'];
const APPT_DAYS = ['tomorrow', 'today', 'on Friday', 'on Monday', 'on 18 Nov', 'day after tomorrow', 'this Saturday', 'next Tuesday', 'on 2nd Dec', 'on Nov 25'];
const APPT_TIMES = ['10 am', '2:30 pm', '11:00 AM', '4 p.m', '6pm', '9.30 am', '5:45 PM', '12 pm'];
const HI_DAYS = ['kal', 'parso', 'Monday ko', 'aaj', 'Saturday ko', 'Friday ko'];
const HI_TIMES = ['10 baje', 'shaam 5 baje', 'subah 11 baje', 'dopahar 2 baje', 'raat 8 baje', 'subah 9 baje'];

const VALUES = [99, 149, 371, 499, 750, 999, 1299, 2499, 4200, 8999, 15000, 23450, 45000, 100000, 125000];
const inr = (v) => v.toLocaleString('en-IN');
const EN_FORMATS = [
  (v) => [`₹${inr(v)}`, v], (v) => [`Rs. ${inr(v)}`, v], (v) => [`Rs ${v}`, v], (v) => [`INR ${inr(v)}`, v], (v) => [`${v} rupees`, v],
  (v) => [`₹${v}`, v], (v) => [`Rs.${v}.00`, v], (v) => [`₹ ${inr(v)}`, v], (v) => [`Rs.${inr(v)}/-`, v], (v) => [`₹${v}/-`, v],
  (v) => [`${inr(v)} Rs`, v], (v) => [`rs ${v}`, v], (v) => [`Rs${v}`, v], (v) => [`${v} INR`, v], (v) => [`₹${inr(v)}.50`, v + 0.5],
];
const K_FORMATS = [(k) => `₹${k}k`, (k) => `${k}k rupees`, (k) => `Rs ${k}k`, (k) => `₹${k}K`, (k) => `Rs.${k}k`];
const LAKH = [['1 lakh', 100000], ['1.5 lakh', 150000], ['2.5 lakhs', 250000], ['3 lakh', 300000], ['1.2 lakh', 120000]];

function helpers(r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const chance = (p) => r() < p;
  /** English-style amount: { t, minor } */
  const amt = () => {
    const x = r();
    if (x < 0.08) {
      const k = pick([2, 5, 10, 15, 25, 50]);
      return { t: pick(K_FORMATS)(k), minor: k * 1000 * 100 };
    }
    if (x < 0.12) {
      const [w, v] = pick(LAKH);
      return { t: `${pick(['₹', 'Rs ', 'Rs. '])}${w}`, minor: v * 100 };
    }
    const [t, v] = pick(EN_FORMATS)(pick(VALUES));
    return { t, minor: Math.round(v * 100) };
  };
  /** Hinglish amount that reads naturally before "ka refund", "ka bill": bare number or with rupaye/rs/₹. */
  const hamt = () => {
    const v = pick(VALUES);
    const f = pick([(x) => String(x), (x) => inr(x), (x) => `${x} rupaye`, (x) => `₹${x}`, (x) => `${x} rs`, (x) => `Rs ${x}`, (x) => `${x} rupay`]);
    return { t: f(v), minor: v * 100 };
  };
  const ex = () => pick(EX_EN);
  const est = () => pick(EST_EN);
  const exh = () => pick(EX_HI);
  const esth = () => pick(EST_HI);
  /** Any English time phrase with its kind. */
  const when = () => (chance(0.5) ? { t: ex(), k: 'EXPLICIT' } : { t: est(), k: 'ESTIMATED' });
  const whenh = () => (chance(0.5) ? { t: exh(), k: 'EXPLICIT' } : { t: esth(), k: 'ESTIMATED' });
  const num = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  return { r, pick, chance, amt, hamt, ex, est, exh, esth, when, whenh, num };
}

// ------------------------------------------------------------------ templates
// [lang, (s) => [text, expect, partyKind]]  partyKind: 'person' when the counterparty is a plain name
// (lowercase noise makes such names unreadable without capitals, so that check is skipped then).
const en = (fn) => ['en', fn];
const hi = (fn) => ['hi', fn];
const C = (o) => ({ isCommitment: true, ...o });
const N = (o) => ({ isCommitment: false, ...o });

const T = {
  REFUND: [
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`${m} initiated my refund of ${a.t} ${s.pick(PAST)} but I haven't received it yet.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const a = s.amt(), w = s.est(); return [`Your refund of ${a.t} for order ${s.pick(ORDERS)} has been initiated and will be credited ${w}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Still waiting for my ${m} refund of ${a.t}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Refund of ${a.t} from ${m} is ${s.pick(['still pending', 'not credited yet', 'not received till now', 'yet to be credited', 'pending since last week'])}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m} refund not received. It's been ${s.num(5, 20)} days now.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null, amountMinor: null })]; }),
    en((s) => { const m = s.pick(TRAVEL), a = s.amt(), w = s.est(); return [`Cancelled my ${m} booking, refund of ${a.t} expected ${w}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(), w = s.when(); return [`${m} said the refund of ${a.t} will reflect in my account ${w.t}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: w.k })]; }),
    en((s) => { const m = s.pick(SHOPS), i = s.pick(ITEMS); return [`I returned the ${i} to ${m} ${s.pick(PAST)}, refund still not processed.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Where is my refund ${m}? Order ${s.pick(ORDERS)}`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Your refund of ${a.t} has been successfully credited to your account. - Team ${m}`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`${m}: Refund of ${a.t} processed for order ${s.pick(ORDERS)}.`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Got the ${m} refund of ${a.t} today.`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const m = s.pick(TRAVEL), a = s.amt(); return [`Refund of ${a.t} received from ${m}, thanks.`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const m = s.pick(SHOPS), i = s.pick(ITEMS); return [`Need to request a refund from ${m} for the damaged ${i} ${s.ex()}.`, C({ category: 'REFUND', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT', amountMinor: null })]; }),
    en((s) => { const m = s.pick(TRAVEL), a = s.amt(); return [`Flight got cancelled by ${m}, they promised a full refund of ${a.t}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Hi, my refund for ${m} order ${s.pick(ORDERS)} (${a.t}) is not showing in my bank account.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor })]; }),
    hi((s) => { const m = s.pick(SHOPS), b = s.hamt(); return [`${m} ka ${b.t} ka refund abhi tak nahi aaya`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor, deadlineKind: null })]; }),
    hi((s) => { const m = s.pick(SHOPS), b = s.hamt(); return [`${m} se ${b.t} ka refund aana tha, ab tak nahi aaya`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor, deadlineKind: null })]; }),
    hi((s) => { const m = s.pick(SHOPS), b = s.hamt(); return [`Paisa wapas nahi aaya abhi tak, ${m} ne ${b.t} ka refund bola tha`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor })]; }),
    hi((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`${m} wale refund kab denge? ${a.t} pending hai`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor })]; }),
    hi((s) => { const m = s.pick(SHOPS), w = s.esth(); return [`${m} ka refund ${w} aa jayega bola hai`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED', amountMinor: null })]; }),
    hi((s) => { const m = s.pick(SHOPS), b = s.hamt(); return [`${m} ka refund ${b.t} aa gaya account me`, N({ category: 'REFUND', counterparty: m, amountMinor: b.minor })]; }),
    hi((s) => { const m = s.pick(TRAVEL), b = s.hamt(); return [`${m} se ${b.t} ka refund mil gaya`, N({ category: 'REFUND', counterparty: m, amountMinor: b.minor })]; }),
    hi((s) => { const m = s.pick(SHOPS), b = s.hamt(); return [`Bhai ${m} ka refund aaya kya? Mera ${b.t} ka abhi tak pending hai`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(TRAVEL), b = s.hamt(); return [`${m} ki ticket cancel ki thi, ${b.t} ka refund ${s.esth()} aayega`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor, deadlineKind: 'ESTIMATED' })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} pe return kiya tha, refund ka koi update nahi hai`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: null })]; }),
  ],

  PAYMENT: [
    en((s) => { const m = s.pick([...UTILITIES, ...TELCOS]), a = s.amt(), w = s.ex(); return [`${m} bill of ${a.t} is due ${w}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const a = s.amt(); return [`Need to pay ${a.t} rent ${s.ex()}.`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BANKS), a = s.amt(); return [`${m} credit card payment of ${a.t} due ${s.ex()}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BANKS), a = s.amt(); return [`EMI of ${a.t} for my ${m} loan is due on the ${s.pick(['5th', '7th', '10th', '1st'])}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const a = s.amt(); return [`Client hasn't paid my invoice of ${a.t} yet.`, C({ category: 'PAYMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`${p} owes me ${a.t} for the ${s.pick(['Goa trip', 'concert tickets', 'dinner', 'cab'])}.`, C({ category: ['PAYMENT', 'PERSONAL_PROMISE'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor, deadlineKind: null }), 'person']; }),
    en((s) => [`Salary for ${s.pick(MONTHS)} not credited yet.`, C({ category: 'PAYMENT', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: null })]),
    en((s) => { const m = s.pick([...TELCOS, ...SHOPS]), a = s.amt(); return [`Payment of ${a.t} to ${m} was successful. Transaction ID TXN${s.num(100000000, 999999999)}.`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Paid ${a.t} to ${m} but the money got debited twice, waiting for the reversal.`, C({ category: ['PAYMENT', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const m = s.pick(TELCOS), a = s.amt(); return [`Your ${m} postpaid bill of ${a.t} is generated. Due date: ${s.pick(['20 Nov', '25/11/2026', '28th November'])}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const a = s.amt(); return [`Reminder: ${a.t} school fees due ${s.ex()}.`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`Pay ${a.t} to ${p} for the ${s.pick(['flat deposit', 'football turf', 'gift', 'groceries'])} ${s.ex()}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: p, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const m = s.pick(TELCOS), a = s.amt(); return [`${m} recharge of ${a.t} done successfully.`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const m = s.pick(SHOPS), a = s.amt(); return [`Your payment of ${a.t} to ${m} failed. If debited, the amount will be refunded ${s.est()}.`, C({ category: ['PAYMENT', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const a = s.amt(); return [`UPI transaction of ${a.t} failed but the money got deducted from my account.`, C({ category: ['PAYMENT', 'REFUND'], waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(UTILITIES), a = s.amt(); return [`Paid the ${m} electricity bill of ${a.t} today.`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => { const a = s.amt(); return [`Society maintenance of ${a.t} has to be paid ${s.ex()}.`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const b = s.hamt(); return [`${b.t} ka bijli bill bharna hai ${s.exh()}`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: b.minor, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const a = s.amt(); return [`Is mahine ka rent ${a.t} dena hai ${s.exh()}`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`${p} ko ${a.t} wapas karne hain ${s.exh()}`, C({ category: ['PAYMENT', 'PERSONAL_PROMISE'], waitingOn: 'USER', counterparty: p, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ne bola tha ${s.exh()} paise de dega`, C({ category: ['PAYMENT', 'PERSONAL_PROMISE'], waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => [`Salary abhi tak credit nahi hui`, C({ category: 'PAYMENT', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: null, amountMinor: null })]),
    hi((s) => { const m = s.pick(TELCOS), a = s.amt(); return [`${m} ka recharge ${a.t} ka ho gaya`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor })]; }),
    hi((s) => { const m = s.pick(BANKS), a = s.amt(); return [`${m} credit card ka bill ${a.t} pending hai, ${s.exh()} bharna hai`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(BANKS), a = s.amt(); return [`EMI ${a.t} kat gayi ${m} se`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor })]; }),
    hi((s) => { const a = s.amt(); return [`Client ne ${a.t} ka payment abhi tak nahi kiya`, C({ category: 'PAYMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
  ],

  REPAIR: [
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), w = s.est(); return [`I gave my ${i} for repair at the ${m} service center. They said they would call me ${w}.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED', amountMinor: null })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} technician will come ${s.ex()} to fix the ${i}.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`My ${i} is still at the ${m} service center, no update yet.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${i} not ${s.pick(['working', 'cooling', 'turning on', 'charging'])} since ${s.pick(PAST)}, ${m} engineer visit pending.`, C({ category: ['REPAIR', 'SERVICE_REQUEST'], waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const i = s.pick(ITEMS); return [`Technician didn't show up today for the ${i} repair.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`Need to collect my ${i} from the ${m} service center ${s.ex()}.`, C({ category: 'REPAIR', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), a = s.amt(); return [`${m} service center quoted ${a.t} for the ${i} repair, waiting for them to order the part.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor })]; }),
    en((s) => [`Plumber said he would come ${s.ex()} to fix the leak.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: 'EXPLICIT' })]),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`Book a ${m} service visit for the ${i} ${s.ex()}.`, C({ category: ['REPAIR', 'SERVICE_REQUEST', 'APPOINTMENT'], waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${i} repair is done, collected it from ${m} today.`, N({ category: 'REPAIR', counterparty: m })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} technician fixed the ${i} today, working fine now.`, N({ category: 'REPAIR', counterparty: m })]; }),
    en((s) => { const i = s.pick(ITEMS); return [`The ${i} has been repaired and handed back to me.`, N({ category: 'REPAIR' })]; }),
    en((s) => { const c = s.pick(CARS); return [`My car is at the ${c} workshop for servicing, they said it will be ready ${s.ex()}.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: c, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`Screen replacement for my ${i} at ${m} is taking forever, still waiting for the spare part.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => [`Electrician is supposed to come ${s.ex()} to fix the switchboard.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: 'EXPLICIT' })]),
    hi((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} wale ne bola tha ${i} ${s.esth()} theek ho jayega, abhi tak call nahi aaya`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${i} kharab ho gaya hai, ${m} service center me diya hai`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const i = s.pick(ITEMS), w = s.exh(); return [`Mistri ${w} aayega ${i} theek karne`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${i} theek ho gaya, ${m} wale ne aaj wapas de diya`, N({ category: 'REPAIR', counterparty: m })]; }),
    hi((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} ka engineer ${s.exh()} aane wala hai ${i} dekhne`, C({ category: ['REPAIR', 'SERVICE_REQUEST'], waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const i = s.pick(ITEMS); return [`${i} repair ke liye dena hai ${s.exh()}`, C({ category: 'REPAIR', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} service center se ${i} lena hai ${s.exh()}`, C({ category: 'REPAIR', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const i = s.pick(ITEMS); return [`Plumber aaya hi nahi aaj, ${i} ka leakage abhi bhi hai`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null })]; }),
  ],

  DELIVERY: [
    en((s) => { const m = s.pick(SHOPS); return [`My ${m} order ${s.pick(ORDERS)} was supposed to arrive ${s.pick(PAST)} but it's still not delivered.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: null, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m}: Your order has been shipped and will be delivered ${s.ex()}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Out for delivery today: your ${m} package.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Courier from ${m} hasn't arrived yet, tracking says delayed.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m} parcel stuck in transit for ${s.num(3, 12)} days.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Expected delivery of my ${m} order is ${s.pick(['18 Nov', 'Friday', 'tomorrow', '20/11/2026', 'Nov 21'])}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m} delivery guy said he will come ${s.ex()}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Return pickup for my ${m} order is scheduled ${s.ex()}.`, C({ category: ['DELIVERY', 'REFUND', 'APPOINTMENT'], counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Your ${m} order will arrive ${s.est()}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const m = s.pick(SHOPS), i = s.pick(ITEMS); return [`Ordered a ${i} from ${m} ${s.pick(PAST)}, no shipping update yet.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Delivered: your ${m} package was delivered today at 2:14 PM.`, N({ category: 'DELIVERY', counterparty: m })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Got my ${m} parcel today, everything is fine.`, N({ category: 'DELIVERY', counterparty: m })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Wrong item delivered by ${m}, need to raise a return request ${s.ex()}.`, C({ category: ['DELIVERY', 'REFUND', 'SERVICE_REQUEST'], waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Your ${m} package is arriving today between 2 PM and 6 PM.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m} order marked delivered but I never received it.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} ka order abhi tak nahi aaya, bola tha ${s.pick(['kal', 'Monday tak', '2 din me', 'parso tak'])} aa jayega`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} ka parcel ${s.exh()} aayega`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} ka parcel mil gaya`, N({ category: 'DELIVERY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(SHOPS), i = s.pick(ITEMS); return [`${m} se ${i} mangaya tha, ${s.num(4, 15)} din ho gaye abhi tak nahi aaya`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    hi((s) => { const w = s.exh(); return [`Delivery boy ne call kiya tha, ${w} dobara aayega`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} ka order deliver ho gaya`, N({ category: 'DELIVERY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} wala parcel galat address pe chala gaya, track nahi ho raha`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
  ],

  APPOINTMENT: [
    en((s) => { const d = s.pick(DOCTORS); return [`I have an appointment with Dr. ${d} at ${s.pick(APPT_TIMES)} ${s.pick(APPT_DAYS)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: d, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => [`Dentist appointment ${s.pick(APPT_DAYS)} at ${s.pick(APPT_TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT', amountMinor: null })]),
    en((s) => { const h = s.pick(HOSPITALS); return [`Your appointment at ${h} Hospital is confirmed for ${s.pick(['18 Nov', '20/11/2026', 'Friday', 'tomorrow', 'Nov 22'])}, ${s.pick(APPT_TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: h, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Meeting with ${p} ${s.pick(APPT_DAYS)} at ${s.pick(APPT_TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const c = s.pick(COMPANIES); return [`Interview scheduled with ${c} on ${s.pick(['18 Nov', 'Monday', '20/11/2026', 'Dec 1'])} at ${s.pick(APPT_TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(CARS); return [`Car service appointment at ${m} on ${s.pick(['Saturday', '18 Nov', 'Monday'])}.`, C({ category: ['APPOINTMENT', 'REPAIR'], waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => [`Parent-teacher meeting at school ${s.pick(APPT_DAYS)} at ${s.pick(APPT_TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const l = s.pick(LABS); return [`${l} home sample collection booked for ${s.pick(['tomorrow', 'Saturday', '18 Nov'])} at ${s.pick(['7 am', '8:30 AM', '7.30 am'])}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: l, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Call with ${p} at ${s.pick(APPT_TIMES)} ${s.pick(APPT_DAYS)} about the project.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const d = s.pick(DOCTORS); return [`Had my appointment with Dr. ${d} yesterday, all good.`, N({ category: 'APPOINTMENT', counterparty: d })]; }),
    en((s) => { const d = s.pick(DOCTORS); return [`My appointment with Dr. ${d} ${s.pick(['on Friday', 'tomorrow', 'on 18 Nov'])} got cancelled.`, N({ category: 'APPOINTMENT', counterparty: d })]; }),
    en((s) => { const h = s.pick(HOSPITALS); return [`Rescheduled my ${h} appointment to ${s.pick(['Friday', '22 Nov', 'next Monday'])}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: h, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => [`Driving test slot booked for ${s.pick(['Monday', '19 Nov', 'tomorrow'])} at the RTO.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const p = s.pick(PEOPLE); return [`Dinner with ${p} ${s.pick(['tomorrow', 'on Saturday', 'tonight'])} at ${s.pick(['8 pm', '9 pm', '7:30 pm'])}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => [`Visa appointment at VFS ${s.pick(['on 3 Dec', 'tomorrow', 'on Friday'])} at ${s.pick(APPT_TIMES)}, carry all documents.`, C({ category: ['APPOINTMENT', 'DOCUMENT'], waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    hi((s) => [`Doctor ne ${s.pick(['kal', 'Monday ko', 'parso'])} ${s.pick(HI_TIMES)} bulaya hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    hi((s) => { const p = s.pick(PEOPLE); return [`${s.pick(HI_DAYS)} ${s.pick(HI_TIMES)} ${p} se milna hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const h = s.pick(HOSPITALS); return [`${h} me ${s.pick(HI_DAYS)} ${s.pick(HI_TIMES)} checkup hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: h, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const c = s.pick(COMPANIES); return [`Interview hai ${c} me ${s.pick(HI_DAYS)} ${s.pick(HI_TIMES)}`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => [`Doctor se mil liya, sab theek hai`, N({ category: 'APPOINTMENT', counterparty: null })]),
    hi((s) => { const d = s.pick(DOCTORS); return [`Dr ${d} ka appointment ${s.pick(HI_DAYS)} ${s.pick(HI_TIMES)} ka hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: d, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => [`Salon me ${s.pick(HI_DAYS)} ${s.pick(HI_TIMES)} ki booking hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
  ],

  SERVICE_REQUEST: [
    en((s) => { const m = s.pick(TELCOS); return [`Raised a complaint with ${m} about ${s.pick(ISSUES)}, ticket ${s.pick(TICKETS)}. Waiting for resolution.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => [`Your service request ${s.pick(TICKETS)} has been registered. Our team will contact you within 48 hours.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' })]),
    en((s) => { const m = s.pick(TELCOS); return [`${m} internet down since ${s.pick(PAST)}, complaint number ${s.pick(TICKETS)}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    en((s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`Called ${m} customer care about ${s.pick(ISSUES)}, they said they'll get back ${s.est()}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`Escalated the issue with ${m}, request id ${s.pick(TICKETS)}, still open.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(TELCOS); return [`SIM replacement request with ${m} is still pending.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(BANKS); return [`${m} said my ${s.pick(['debit card block request', 'address change request', 'cheque book request', 'account unfreeze request'])} will be completed ${s.est()}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`Need to call ${m} customer care ${s.ex()} about the ${s.pick(ISSUES)}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => [`Filed a complaint on the consumer helpline, ref no ${s.pick(TICKETS)}, no response yet.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY' })]),
    en((s) => [`Your complaint ${s.pick(TICKETS)} has been resolved. Thank you for your patience.`, N({ category: 'SERVICE_REQUEST' })]),
    en((s) => { const m = s.pick(TELCOS); return [`${m} fixed the broadband issue today, complaint closed.`, N({ category: 'SERVICE_REQUEST', counterparty: m })]; }),
    en((s) => { const m = s.pick(TELCOS); return [`New ${m} connection installation is pending, the technician hasn't come.`, C({ category: ['SERVICE_REQUEST', 'REPAIR'], waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(BANKS); return [`${m} support ticket ${s.pick(TICKETS)} for the chargeback is still under review.`, C({ category: ['SERVICE_REQUEST', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    en((s) => { const m = s.pick(UTILITIES); return [`Complained to ${m} about the meter reading, they will send someone ${s.ex()}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(TELCOS); return [`${m} ko complaint kiya tha, abhi tak koi response nahi aaya`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
    hi((s) => { const m = s.pick(TELCOS); return [`${m} ka wifi ${s.num(2, 6)} din se band hai, complaint ${s.pick(TICKETS)} pe koi action nahi`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null })]; }),
    hi((s) => { const m = s.pick(BANKS); return [`${m} wale bole ${s.esth()} ho jayega, request ${s.pick(TICKETS)}`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' })]; }),
    hi((s) => { const m = s.pick(TELCOS); return [`${m} ka internet issue solve ho gaya`, N({ category: 'SERVICE_REQUEST', counterparty: m })]; }),
    hi((s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`${m} customer care ko ${s.exh()} call karna hai`, C({ category: 'SERVICE_REQUEST', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    hi((s) => { const m = s.pick(TELCOS); return [`${m} ki sim band ho gayi hai, request daali hai ${s.pick(TICKETS)}`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m })]; }),
  ],

  DOCUMENT: [
    en((s) => [`Need to submit my ${s.pick(['PAN card copy', 'Form 16', 'rent receipts', 'offer letter', 'bank statement'])} to ${s.pick(['HR', 'the accounts team', 'my CA'])} ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => [`Please upload your ${s.pick(['address proof', 'ID proof', 'income proof'])} for KYC verification ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const p = s.pick(PEOPLE), w = s.when(); return [`${p} said he will send the ${s.pick(['rent agreement', 'signed NOC', 'property papers', 'invoice copy'])} ${w.t}.`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: w.k }), 'person']; }),
    en((s) => [`Waiting for the ${s.pick(['experience letter', 'relieving letter', 'salary slips'])} from my previous company.`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', deadlineKind: null })]),
    en((s) => [`${s.pick(['College', 'The university', 'The school'])} will issue the ${s.pick(['degree certificate', 'transfer certificate', 'marksheet'])} ${s.est()}.`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' })]),
    en((s) => [`Have to get my ${s.pick(['Aadhaar address', 'passport', 'driving licence'])} updated ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const m = s.pick(BANKS); return [`${m} asked for ${s.pick(['income proof', 'address proof', 'salary slips'])}, I need to send it ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => [`Remember to carry the original ${s.pick(['marksheets', 'PAN card', 'Aadhaar card'])} for verification ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => [`Passport documents verified successfully.`, N({ category: 'DOCUMENT' })]),
    en((s) => { const p = s.pick(PEOPLE); return [`Received the signed ${s.pick(['NOC', 'rent agreement', 'contract'])} from ${p} today.`, N({ category: 'DOCUMENT', counterparty: p }), 'person']; }),
    en((s) => [`Your ${s.pick(['PAN card', 'passport', 'debit card'])} has been dispatched and will reach you ${s.est()}.`, C({ category: ['DOCUMENT', 'DELIVERY'], waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' })]),
    en((s) => [`ITR filing deadline is ${s.pick(['31 Dec', 'Dec 31', '31/12/2026'])}, have to collect Form 16 first.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const p = s.pick(PEOPLE); return [`Send the scanned documents to ${p} ${s.ex()}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ko documents bhejne hain ${s.exh()}`, C({ category: 'DOCUMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => [`${s.pick(['College', 'Office', 'University'])} se ${s.pick(['certificate', 'marksheet', 'experience letter'])} abhi tak nahi mila`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY' })]),
    hi((s) => [`${s.pick(['Aadhaar', 'PAN card', 'passport'])} update karwana hai ${s.exh()}`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    hi((s) => [`${s.pick(['Form 16', 'PAN card copy', 'rent receipts'])} submit kar diya HR ko`, N({ category: 'DOCUMENT' })]),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ne bola ${s.esth()} agreement bhej dega`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'ESTIMATED' }), 'person']; }),
    hi((s) => [`KYC ke liye documents ${s.exh()} upload karne hain`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
  ],

  REIMBURSEMENT: [
    en((s) => { const a = s.amt(); return [`Submitted travel reimbursement of ${a.t} to office, not received yet.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
    en((s) => { const a = s.amt(); return [`Medical reimbursement claim of ${a.t} is pending with HR.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
    en((s) => [`Need to submit my fuel bills for reimbursement ${s.ex()}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const i = s.pick(INSURERS), a = s.amt(); return [`Insurance claim of ${a.t} filed with ${i}, they said ${s.pick(['7-10 working days', '5-7 business days', '2 weeks', '15 days'])}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i, amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const a = s.amt(); return [`Reimbursement of ${a.t} credited to my salary account.`, N({ category: 'REIMBURSEMENT', amountMinor: a.minor })]; }),
    en((s) => { const a = s.amt(); return [`Expense claim for the client dinner (${a.t}) got approved, payout in the next cycle.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
    en((s) => { const i = s.pick(INSURERS), a = s.amt(); return [`Mediclaim for the hospital bill of ${a.t} is under process with ${i}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i, amountMinor: a.minor })]; }),
    en((s) => { const i = s.pick(INSURERS), a = s.amt(); return [`${i} settled my claim of ${a.t}, money received.`, N({ category: 'REIMBURSEMENT', counterparty: i, amountMinor: a.minor })]; }),
    en((s) => [`Have to upload the hospital discharge summary for the insurance claim ${s.ex()}.`, C({ category: ['REIMBURSEMENT', 'DOCUMENT'], waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const a = s.amt(); return [`Manager approved my reimbursement of ${a.t}, finance will pay ${s.est()}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
    en((s) => { const a = s.amt(); return [`Travel claim of ${a.t} submitted on the expense portal ${s.pick(PAST)}, still not approved.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: null })]; }),
    en((s) => { const i = s.pick(INSURERS); return [`Have to file the ${s.pick(['health', 'car', 'travel'])} insurance claim with ${i} ${s.ex()}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'USER', counterparty: i, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const a = s.amt(); return [`Internet allowance of ${a.t} for ${s.pick(MONTHS)} still not paid by the company.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
    hi((s) => { const b = s.hamt(); return [`Office ka ${b.t} ka reimbursement abhi tak nahi aaya`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: b.minor })]; }),
    hi((s) => { const i = s.pick(INSURERS); return [`${i} se claim ka paisa ${s.esth()} aayega`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i, deadlineKind: 'ESTIMATED' })]; }),
    hi((s) => [`Medical bills ${s.exh()} submit karne hain reimbursement ke liye`, C({ category: 'REIMBURSEMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    hi((s) => { const a = s.amt(); return [`Reimbursement ${a.t} aa gaya salary ke saath`, N({ category: 'REIMBURSEMENT', amountMinor: a.minor })]; }),
    hi((s) => { const a = s.amt(); return [`Claim ${a.t} ka approve ho gaya hai, paisa ${s.esth()} aayega`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
  ],

  PERSONAL_PROMISE: [
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} said he would return my ${t} ${s.ex()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`${p} promised to pay back ${a.t} ${s.est()}.`, C({ category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`Lent ${a.t} to ${p}, will get it back next month.`, C({ category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`I promised ${p} I'd ${s.pick(['call back', 'send the photos', 'help with the move', 'review the resume'])} ${s.ex()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Told ${p} I would send the notes by evening.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} hasn't returned my ${t} yet.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} returned the ${t} today.`, N({ category: 'PERSONAL_PROMISE', counterparty: p }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Need to return ${p}'s ${s.pick(THINGS)} ${s.ex()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`${p} will drop off the ${s.pick(THINGS)} ${s.ex()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`${p} paid back the ${a.t} he owed me.`, N({ category: ['PERSONAL_PROMISE', 'PAYMENT'], counterparty: p, amountMinor: a.minor }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`${p} said she will confirm the wedding dates ${s.est()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'ESTIMATED' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Borrowed ${s.pick(THINGS)} from ${p}, have to give it back ${s.ex()}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ne bola tha ${s.exh()} paise de dega`, C({ category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} se ${t} wapas lena hai`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE), a = s.amt(); return [`${p} ko ${a.t} udhaar diye the, abhi tak wapas nahi kiye`, C({ category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} ne ${t} wapas kar diya`, N({ category: 'PERSONAL_PROMISE', counterparty: p }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} ko ${t} lautana hai ${s.exh()}`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ne promise kiya tha ${s.esth()} photos bhej dega`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'ESTIMATED' }), 'person']; }),
  ],

  INFORMATIONAL: [
    en((s) => [`Your OTP for login is ${s.num(100000, 999999)}. Do not share it with anyone.`, N({ amountMinor: null, deadlineKind: null })]),
    en((s) => { const m = s.pick(SHOPS); return [`Flat ${s.pick([30, 40, 50, 60, 70])}% off on everything at ${m} this weekend! Shop now.`, N({ deadlineKind: null })]; }),
    en((s) => { const m = s.pick(BANKS); return [`Your ${m} account statement for ${s.pick(MONTHS)} is now available.`, N({ deadlineKind: null, amountMinor: null })]; }),
    en((s) => { const m = s.pick(SHOPS); return [`Thank you for shopping with ${m}! We hope to see you again.`, N({ deadlineKind: null })]; }),
    en((s) => [`Your password was changed successfully. If this wasn't you, contact support.`, N({ deadlineKind: null })]),
    en((s) => [`Hi, how are you? Long time no see!`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    en((s) => { const m = s.pick(BANKS), a = s.amt(); return [`Dear customer, your ${m} a/c XX${s.num(1000, 9999)} is credited with ${a.t} on ${s.pick(['10 Nov', '09-11-2026', '8 Nov'])}. Avl bal ${s.amt().t}.`, N({ deadlineKind: null })]; }),
    en((s) => [`Good morning! Have a great day 😊`, N({ deadlineKind: null, amountMinor: null })]),
    en((s) => { const m = s.pick(SHOPS); return [`${m}: Your order ${s.pick(ORDERS)} has been placed successfully.`, N({ deadlineKind: null })]; }),
    en((s) => [`Meeting notes from today are attached for your reference.`, N({ deadlineKind: null, amountMinor: null })]),
    en((s) => [`Electricity supply will be interrupted ${s.pick(['tomorrow', 'on Saturday', 'on 18 Nov'])} from 10 am to 2 pm for maintenance.`, N({ amountMinor: null })]),
    en((s) => { const m = s.pick(BANKS), a = s.amt(); return [`${m}: ${a.t} debited from your a/c XX${s.num(1000, 9999)} on ${s.pick(['10 Nov', '09-11-26'])} for UPI txn. Not you? Call 1800${s.num(100000, 999999)}.`, N({ deadlineKind: null })]; }),
    en((s) => [`You have been selected for a pre-approved personal loan of ${s.pick(['Rs 5,00,000', '₹3,00,000', 'Rs. 10 lakh'])}. Apply now!`, N({ deadlineKind: null })]),
    en((s) => [`Thanks for the update.`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    en((s) => { const p = s.pick(PEOPLE); return [`Happy birthday ${p}! 🎂`, N({ deadlineKind: null, amountMinor: null })]; }),
    en((s) => { const m = s.pick(TRAVEL); return [`Your ${m} trip receipt for ${s.pick(['Monday', 'yesterday', '9 Nov'])} is here.`, N({ deadlineKind: null })]; }),
    hi((s) => [`Kya haal hai bhai?`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    hi((s) => { const m = s.pick(SHOPS); return [`Sale shuru! ${m} pe ${s.pick([50, 60, 70])}% tak off`, N({ deadlineKind: null })]; }),
    hi((s) => [`Diwali ki hardik shubhkamnayein!`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    hi((s) => [`Aaj bahut garmi hai yaar`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    hi((s) => [`Theek hai, baad me baat karte hain`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    hi((s) => [`Ghar pahunch gaya`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
  ],
};

// ------------------------------------------------------------------ noise
const PREFIXES = ['Hi, ', 'Hello sir, ', 'Fwd: ', 'Bhai ', 'Yaar ', 'Hey, '];
/** First words that are names: never lowercased when a prefix is added. */
const PROPER = new Set(
  [SHOPS, TRAVEL, TELCOS, UTILITIES, BANKS, BRANDS, HOSPITALS, LABS, INSURERS, COMPANIES, CARS, PEOPLE, DOCTORS].flat().map((n) => n.split(' ')[0]),
);
['EMI', 'UPI', 'ITR', 'KYC', 'I', 'Dr', 'Dr.', 'IRCTC', 'SBI', 'HDFC', 'ICICI'].forEach((w) => PROPER.add(w));
const SUFFIXES = [' 😡', ' 🙏', ' 😕', ' !!', '...', ' 😤', ' pls', ' plz', ' 🙄'];

function noisy(text, s) {
  let t = text;
  const applied = [];
  if (s.chance(0.15)) { t = t.toLowerCase(); applied.push('lower'); }
  if (s.chance(0.25)) { t = t.replace(/[.!]+$/, ''); applied.push('nopunct'); }
  if (s.chance(0.12)) { t += s.pick(SUFFIXES); applied.push('suffix'); }
  if (s.chance(0.06)) {
    // Lowercase only a common first word ("Hi, need to pay…"), never a name the generator may not know about.
    const first = t.split(/[\s:,]/)[0];
    const common = /^(?:Need|Have|Your|My|Still|The|Please|Paid|Got|Submitted|Called|Raised|Escalated|Cancelled|Ordered|Lent|Told|Borrowed|Book|Pay|Send|Remember|Reminder|Refund|Salary|Delivered|Courier|Dentist|Meeting|Interview|Call|Dinner|Driving|Had|Rescheduled|Filed|Where|Expected|Return|Wrong|Out|Received|Waiting|Is|Doctor|Office|Claim|Medical|Travel|Expense|Manager|Mediclaim|Insurance|Reimbursement|Internet|Society|Client|Flight|Screen|Electrician|Plumber|Technician|Delivery|College|Passport|Sent|Tracking|Delivery|Team|Eye|Blood|Landlord|Lodged|Still|Port|Submit|Promised|Need|University|Birth|Expense|Cashless|Car|Washing|Thank|Win|New|Lunch)$/;
    const keep = applied.includes('lower') || PROPER.has(first) || !common.test(first);
    t = s.pick(PREFIXES) + (keep ? t : t.charAt(0).toLowerCase() + t.slice(1));
    applied.push('prefix');
  }
  if (s.chance(0.05)) { t = t.replace(/ /g, (m) => (s.chance(0.15) ? '  ' : m)); applied.push('spaces'); }
  return { text: t, applied };
}

/** Templates that are held out from tuning: every 4th per category. */
export const isTestTemplate = (index) => index % 4 === 3;

/**
 * Builds `total` unique messages, equal share per category, English/Hinglish as the templates mix them.
 * Each item: { group, pattern, lang, split: 'dev'|'test', text, expect, noise }
 */
export function buildLarge(total = 100000, seed = 20261113) {
  return buildFrom(T, total, seed, { skipLowerFor: ['person'], split: (index) => (isTestTemplate(index) ? 'test' : 'dev') });
}

/** Shared generator: equal share per category, unique texts, noise applied. Used by the large and blind sets. */
export function buildFrom(templatesByGroup, total, seed, { skipLowerFor = ['person'], split = () => 'blind' } = {}) {
  const groups = Object.keys(templatesByGroup);
  const per = Math.ceil(total / groups.length);
  const out = [];
  for (const group of groups) {
    const templates = templatesByGroup[group];
    const r = rng(seed + group.length * 104729 + group.charCodeAt(0));
    const s = helpers(r);
    const seen = new Set();
    let guard = 0;
    let made = 0;
    while (made < per && guard++ < per * 30) {
      const index = Math.floor(r() * templates.length);
      const [lang, make] = templates[index];
      const [raw, expect, partyKind] = make(s);
      const { text, applied } = noisy(raw, s);
      if (seen.has(text)) continue;
      seen.add(text);
      const e = { ...expect };
      // Without capitals a plain first name (or an unknown brand) can't be told apart from an ordinary word.
      if (applied.includes('lower') && skipLowerFor.includes(partyKind)) delete e.counterparty;
      out.push({ group, pattern: index, lang, split: split(index), text, expect: e, noise: applied });
      made++;
    }
  }
  return out.slice(0, total);
}

export const TEMPLATE_COUNT = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length]));
