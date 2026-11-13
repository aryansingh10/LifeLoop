// LifeLoop extraction evaluation set: ~100 labelled messages per category.
// Messages are built from hand-written sentence patterns × realistic slot values (merchants, amounts,
// dates, names, Hinglish). Labels: undefined = not checked, null = must be empty (hallucination check).
//
//   expect.isCommitment   true/false
//   expect.category       one category or an array of acceptable ones
//   expect.waitingOn      'USER' | 'OTHER_PARTY'
//   expect.counterparty   substring the extracted name must contain (case-insensitive), or null
//   expect.amountMinor    paise, or null
//   expect.deadlineKind   'EXPLICIT' | 'ESTIMATED' | null

// ------------------------------------------------------------------ deterministic randomness
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
const SHOPS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Swiggy', 'Zomato', 'BigBasket', 'Blinkit', 'Zepto', 'Croma', 'Decathlon', 'IKEA', 'Lenskart', 'Pepperfry', 'Tata CLiQ', 'FirstCry', 'Purplle', 'Bewakoof'];
const TRAVEL = ['IRCTC', 'MakeMyTrip', 'Goibibo', 'IndiGo', 'Air India', 'Uber', 'Ola', 'Rapido', 'redBus', 'Cleartrip'];
const TELCOS = ['Airtel', 'Jio', 'Vi', 'BSNL', 'Tata Play', 'ACT Fibernet', 'Hathway'];
const BANKS = ['HDFC', 'ICICI', 'SBI', 'Axis Bank', 'Kotak', 'Paytm', 'PhonePe', 'Bajaj Finserv'];
const BRANDS = ['Samsung', 'Apple', 'OnePlus', 'Xiaomi', 'Dell', 'HP', 'Lenovo', 'LG', 'Whirlpool', 'Sony', 'Asus', 'Voltas'];
const ITEMS = ['laptop', 'phone', 'AC', 'washing machine', 'fridge', 'TV', 'tablet', 'microwave'];
const HOSPITALS = ['Apollo', 'Fortis', 'Manipal', 'Max', 'Narayana'];
const INSURERS = ['Star Health', 'HDFC Ergo', 'ICICI Lombard', 'Niva Bupa'];
const PEOPLE = ['Rahul', 'Priya', 'Amit', 'Neha', 'Rohan Mehta', 'Sneha', 'Vikram', 'Anjali', 'Karan', 'Pooja Iyer', 'Arjun', 'Kavya'];
const DOCTORS = ['Sharma', 'Mehta', 'Iyer', 'Reddy', 'Khan', 'Gupta', 'Nair', 'Kapoor'];
const THINGS = ['book', 'charger', 'headphones', 'camera', 'bike', 'notes', 'power bank'];
const VALUES = [371, 499, 750, 1299, 2499, 4200, 8999, 15000, 23450, 100000];
const PAST = ['yesterday', 'last week', 'on Monday', 'two days ago', 'last Friday', 'on 2 Nov'];

const inr = (v) => v.toLocaleString('en-IN');
const AMOUNT_FORMATS = [
  (v) => `₹${inr(v)}`,
  (v) => `Rs. ${inr(v)}`,
  (v) => `Rs ${v}`,
  (v) => `INR ${inr(v)}`,
  (v) => `${v} rupees`,
  (v) => `₹${v}`,
  (v) => `Rs.${v}.00`,
];
const ESTIMATED = ['within 3 days', 'within 2 days', 'in 5-7 business days', 'in 3-5 working days', 'within a week', 'next week', 'in 2 weeks', 'within 48 hours', 'in 7-10 working days'];
const EXPLICIT = ['by Friday', 'on Monday', 'tomorrow', 'by 20 Nov', 'on 15/11/2026', 'by 25th November', 'day after tomorrow', 'by Saturday'];
const TIMES = ['10 am', '2:30 pm', '11:00 AM', '4 p.m', '6pm', '9.30 am'];
const DAYS = ['tomorrow', 'today', 'on Friday', 'on Monday', 'on 18 Nov', 'day after tomorrow'];
const TICKETS = ['SR123456', 'TKT-88213', 'CMP4471920', '#45821', 'REQ-2026-0911'];
const ORDERS = ['403-1234567-7654321', 'OD12345678901', '#782341', 'ORD99120'];

function picker(r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const amount = () => {
    const v = pick(VALUES);
    return { t: pick(AMOUNT_FORMATS)(v), minor: v * 100 };
  };
  const bare = () => {
    const v = pick(VALUES);
    return { t: r() < 0.5 ? String(v) : inr(v), minor: v * 100 };
  };
  return { pick, amount, bare };
}

// ------------------------------------------------------------------ patterns per category
// Each pattern: (s) => [text, expect]. `s` gives helpers + random slot values.
const P = {
  REFUND: [
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`${m} initiated my refund of ${a.t} ${s.pick(PAST)} but I haven't received it yet.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: null }]; },
    (s) => { const a = s.amount(), w = s.pick(ESTIMATED); return [`Your refund of ${a.t} for order ${s.pick(ORDERS)} has been initiated and will be credited ${w}.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`Still waiting for my ${m} refund of ${a.t}.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: null }]; },
    (s) => { const m = s.pick(SHOPS), b = s.bare(); return [`${m} ka ${b.t} ka refund abhi tak nahi aaya`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor, deadlineKind: null }]; },
    (s) => { const m = s.pick([...SHOPS, ...TRAVEL]), a = s.amount(); return [`Refund of ${a.t} from ${m} is pending since last week.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor }]; },
    (s) => { const m = s.pick(SHOPS), w = s.pick(ESTIMATED); return [`Requested a refund from ${m} for the damaged item, they said it will be processed ${w}.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: null, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(TRAVEL), a = s.amount(); return [`Cancelled my ${m} booking, refund of ${a.t} expected ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(SHOPS), b = s.bare(); return [`Paisa wapas nahi aaya abhi tak, ${m} ne ${b.t} ka refund bola tha`, { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: b.minor }]; },
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`Your refund of ${a.t} has been successfully credited to your account. - Team ${m}`, { isCommitment: false, category: 'REFUND', counterparty: m, amountMinor: a.minor, deadlineKind: null }]; },
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`${m}: Refund of ${a.t} processed for order ${s.pick(ORDERS)}.`, { isCommitment: false, category: 'REFUND', counterparty: m, amountMinor: a.minor }]; },
    (s) => { const m = s.pick(SHOPS), b = s.bare(); return [`${m} ka refund ${b.t} aa gaya account me`, { isCommitment: false, category: 'REFUND', counterparty: m }]; },
    (s) => { const m = s.pick(TRAVEL), a = s.amount(); return [`${m} refund of ${a.t} received today, finally!`, { isCommitment: false, category: 'REFUND', counterparty: m, amountMinor: a.minor }]; },
  ],

  PAYMENT: [
    (s) => { const m = s.pick(TELCOS), a = s.amount(), w = s.pick(EXPLICIT); return [`${m} bill of ${a.t} is due ${w}.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const a = s.amount(), w = s.pick(EXPLICIT); return [`Need to pay ${a.t} rent ${w}.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BANKS), a = s.amount(); return [`${m} credit card payment of ${a.t} due ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BANKS), a = s.amount(); return [`EMI of ${a.t} for my ${m} loan is due on the 5th.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const a = s.amount(); return [`Client hasn't paid my invoice of ${a.t} yet.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: null }]; },
    (s) => { const p = s.pick(PEOPLE), a = s.amount(); return [`${p} owes me ${a.t} for the trip, said he will pay ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: ['PAYMENT', 'PERSONAL_PROMISE'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
    (s) => { return [`Salary for October not received yet, HR says it will come ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick([...TELCOS, ...SHOPS]), a = s.amount(); return [`Payment of ${a.t} to ${m} was successful. Transaction ID TXN${Math.floor(s.r() * 1e9)}.`, { isCommitment: false, category: 'PAYMENT', counterparty: m, amountMinor: a.minor, deadlineKind: null }]; },
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`Paid ${a.t} to ${m} but the money got debited twice, waiting for the reversal.`, { isCommitment: true, category: ['PAYMENT', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor }]; },
    (s) => { const b = s.bare(); return [`${b.t} ka bijli bill bharna hai ${s.pick(['kal tak', 'Friday tak', '20 Nov tak'])}`, { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', amountMinor: b.minor }]; },
    (s) => { const m = s.pick(TELCOS), a = s.amount(); return [`${m} recharge of ${a.t} done successfully.`, { isCommitment: false, category: 'PAYMENT', counterparty: m, amountMinor: a.minor }]; },
    (s) => { const m = s.pick(SHOPS), a = s.amount(); return [`Your payment of ${a.t} to ${m} failed. If debited, the amount will be refunded ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: ['PAYMENT', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
  ],

  REPAIR: [
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), w = s.pick(ESTIMATED); return [`I gave my ${i} for repair at the ${m} service center. They said they would call me ${w}.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED', amountMinor: null }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), w = s.pick(EXPLICIT); return [`${m} technician will come ${w} to fix the ${i}.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`My ${i} is still at the ${m} service center, no update yet.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), w = s.pick(EXPLICIT); return [`${i} repair at ${m} - they promised it would be ready ${w}.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const i = s.pick(ITEMS); return [`Technician didn't show up today for the ${i} repair.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`Need to collect my ${i} from the ${m} service center ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${i} repair is done, collected it from ${m} today.`, { isCommitment: false, category: 'REPAIR', counterparty: m }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} wale ne bola tha ${i} 2 din me theek ho jayega, abhi tak call nahi aaya`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { return [`Plumber said he would come back tomorrow to fix the leak.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS); return [`${m} complaint for ${i} not working, ticket ${s.pick(TICKETS)}. Engineer visit pending.`, { isCommitment: true, category: ['REPAIR', 'SERVICE_REQUEST'], waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(BRANDS), i = s.pick(ITEMS), a = s.amount(); return [`${m} service center quoted ${a.t} for the ${i} repair, waiting for them to order the part.`, { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor }]; },
    (s) => { const i = s.pick(ITEMS); return [`The ${i} has been repaired and handed back to me.`, { isCommitment: false, category: 'REPAIR' }]; },
  ],

  DELIVERY: [
    (s) => { const m = s.pick(SHOPS); return [`My ${m} order ${s.pick(ORDERS)} was supposed to arrive ${s.pick(PAST)} but it's still not delivered.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: null }]; },
    (s) => { const m = s.pick(SHOPS), w = s.pick(EXPLICIT); return [`${m}: Your order has been shipped and will be delivered ${w}.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(SHOPS); return [`Out for delivery today: your ${m} package.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`Delivered: your ${m} package was delivered today at 2:14 PM.`, { isCommitment: false, category: 'DELIVERY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`Courier from ${m} hasn't arrived yet, tracking says delayed.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`${m} parcel AWB${Math.floor(s.r() * 1e8)} stuck in transit for 5 days.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`${m} ka order abhi tak nahi aaya, bola tha ${s.pick(['kal', 'Monday tak', '2 din me'])} aa jayega`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`Expected delivery of my ${m} order is ${s.pick(['18 Nov', 'Friday', 'tomorrow', '20/11/2026'])}.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`${m} delivery guy said he will come tomorrow evening.`, { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(SHOPS); return [`Your ${m} order has been delivered. Rate your experience!`, { isCommitment: false, category: 'DELIVERY', counterparty: m }]; },
    (s) => { const m = s.pick(SHOPS); return [`Return pickup for my ${m} order is scheduled ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: ['DELIVERY', 'REFUND', 'APPOINTMENT'], counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(SHOPS); return [`Got my ${m} parcel today, everything is fine.`, { isCommitment: false, category: 'DELIVERY', counterparty: m }]; },
  ],

  APPOINTMENT: [
    (s) => { const d = s.pick(DOCTORS); return [`I have an appointment with Dr. ${d} at ${s.pick(TIMES)} ${s.pick(DAYS)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: d, deadlineKind: 'EXPLICIT' }]; },
    (s) => { return [`Dentist appointment ${s.pick(DAYS)} at ${s.pick(TIMES)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT', amountMinor: null }]; },
    (s) => { const h = s.pick(HOSPITALS); return [`Your appointment at ${h} Hospital is confirmed for ${s.pick(['18 Nov', '20/11/2026', 'Friday', 'tomorrow'])}, ${s.pick(TIMES)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: h, deadlineKind: 'EXPLICIT' }]; },
    (s) => { return [`Passport appointment booked for ${s.pick(['18 Nov', '20/11/2026', 'Monday'])} at the PSK.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`Meeting with ${p} ${s.pick(DAYS)} at ${s.pick(TIMES)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }]; },
    (s) => { return [`Doctor ne ${s.pick(['kal', 'Monday ko', 'parso'])} ${s.pick(['10 baje', 'shaam 5 baje', '11 baje'])} bulaya hai`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER' }]; },
    (s) => { return [`Reminder: your vaccination slot is booked for ${s.pick(['18 Nov', 'tomorrow', 'Friday'])}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const c = s.pick(['Infosys', 'TCS', 'Accenture', 'Zoho', 'Razorpay']); return [`Interview scheduled with ${c} on ${s.pick(['18 Nov', 'Monday', '20/11/2026'])} at ${s.pick(TIMES)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(['Maruti', 'Hyundai', 'Honda', 'Tata Motors']); return [`Car service appointment at ${m} on ${s.pick(['Saturday', '18 Nov', 'Monday'])}.`, { isCommitment: true, category: ['APPOINTMENT', 'REPAIR'], waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { return [`Haircut booked at ${s.pick(TIMES)} ${s.pick(DAYS)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const d = s.pick(DOCTORS); return [`Had my appointment with Dr. ${d} yesterday, all good.`, { isCommitment: false, category: 'APPOINTMENT', counterparty: d }]; },
    (s) => { const d = s.pick(DOCTORS); return [`Follow-up consultation with Dr ${d} on ${s.pick(['Friday', '18 Nov', 'Monday'])} at ${s.pick(TIMES)}.`, { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: d, deadlineKind: 'EXPLICIT' }]; },
  ],

  SERVICE_REQUEST: [
    (s) => { const m = s.pick(TELCOS); return [`Raised a complaint with ${m} about slow internet, ticket ${s.pick(TICKETS)}. Waiting for resolution.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { return [`Your service request ${s.pick(TICKETS)} has been registered. Our team will contact you within 48 hours.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(TELCOS); return [`${m} internet down since yesterday, complaint number ${s.pick(TICKETS)}.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { return [`Your complaint ${s.pick(TICKETS)} has been resolved. Thank you for your patience.`, { isCommitment: false, category: 'SERVICE_REQUEST' }]; },
    (s) => { const m = s.pick(TELCOS); return [`Ticket ${s.pick(TICKETS)} closed by ${m} support.`, { isCommitment: false, category: 'SERVICE_REQUEST', counterparty: m }]; },
    (s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`Called ${m} customer care about wrong billing, they said they'll get back ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(TELCOS); return [`${m} ko complaint kiya tha, abhi tak koi response nahi aaya`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick([...TELCOS, ...BANKS]); return [`Escalated the issue with ${m}, request id ${s.pick(TICKETS)}, still open.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(TELCOS); return [`SIM replacement request with ${m} is still pending.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(BANKS); return [`Name correction request in my ${m} account is in process.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m }]; },
    (s) => { const m = s.pick(BANKS); return [`${m} said my debit card block request will be completed ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const m = s.pick(TELCOS); return [`${m} fixed the broadband issue today, complaint closed.`, { isCommitment: false, category: 'SERVICE_REQUEST', counterparty: m }]; },
  ],

  DOCUMENT: [
    (s) => { return [`Need to submit my PAN card copy to HR ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { return [`Please upload your address proof for KYC verification ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} said he will send the rent agreement ${s.pick([...EXPLICIT, ...ESTIMATED])}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', counterparty: p }]; },
    (s) => { return [`Waiting for the experience letter from my previous company.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', deadlineKind: null }]; },
    (s) => { return [`College will issue the degree certificate ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' }]; },
    (s) => { return [`Have to get my Aadhaar address updated ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const m = s.pick(BANKS); return [`${m} asked for income proof, I need to send it ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} ko documents bhejne hain kal tak`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', counterparty: p }]; },
    (s) => { return [`Passport documents verified successfully.`, { isCommitment: false, category: 'DOCUMENT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} promised to share the property papers ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'ESTIMATED' }]; },
    (s) => { return [`Submit form 16 to the accounts team ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`Received the signed NOC from ${p} today.`, { isCommitment: false, category: 'DOCUMENT', counterparty: p }]; },
  ],

  REIMBURSEMENT: [
    (s) => { const a = s.amount(); return [`Submitted travel reimbursement of ${a.t} to office, not received yet.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor }]; },
    (s) => { const a = s.amount(); return [`Medical reimbursement claim of ${a.t} is pending with HR.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor }]; },
    (s) => { return [`Need to submit my fuel bills for reimbursement ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const i = s.pick(INSURERS), a = s.amount(); return [`Insurance claim of ${a.t} filed with ${i}, they said ${s.pick(['7-10 working days', '5-7 business days', '2 weeks'])}.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const a = s.amount(); return [`Reimbursement of ${a.t} credited to my salary account.`, { isCommitment: false, category: 'REIMBURSEMENT', amountMinor: a.minor }]; },
    (s) => { const b = s.bare(); return [`Office ka ${b.t} ka reimbursement abhi tak nahi aaya`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: b.minor }]; },
    (s) => { const a = s.amount(); return [`Expense claim for the client dinner (${a.t}) got approved, payout in the next cycle.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor }]; },
    (s) => { const i = s.pick(INSURERS), a = s.amount(); return [`Mediclaim for the hospital bill of ${a.t} is under process with ${i}.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i, amountMinor: a.minor }]; },
    (s) => { const a = s.amount(); return [`Internet bill reimbursement of ${a.t} for October still not paid by the company.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor }]; },
    (s) => { const i = s.pick(INSURERS), a = s.amount(); return [`${i} settled my claim of ${a.t}, money received.`, { isCommitment: false, category: 'REIMBURSEMENT', counterparty: i, amountMinor: a.minor }]; },
    (s) => { return [`Have to upload hospital discharge summary for the insurance claim ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: ['REIMBURSEMENT', 'DOCUMENT'], waitingOn: 'USER', deadlineKind: 'EXPLICIT' }]; },
    (s) => { const a = s.amount(); return [`Manager approved my reimbursement of ${a.t}, finance will pay ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
  ],

  PERSONAL_PROMISE: [
    (s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} said he would return my ${t} ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE), a = s.amount(); return [`${p} promised to pay back ${a.t} ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const p = s.pick(PEOPLE), a = s.amount(); return [`Lent ${a.t} to ${p}, will get it back next month.`, { isCommitment: true, category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} will send the trip photos tonight.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`I promised ${p} I'd call back tomorrow.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`Told ${p} I would send the notes by evening.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} ne bola tha kal paise de dega`, { isCommitment: true, category: ['PERSONAL_PROMISE', 'PAYMENT'], waitingOn: 'OTHER_PARTY', counterparty: p }]; },
    (s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} hasn't returned my ${t} yet.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p }]; },
    (s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} returned the ${t} today.`, { isCommitment: false, category: 'PERSONAL_PROMISE', counterparty: p }]; },
    (s) => { const p = s.pick(PEOPLE); return [`${p} said she will confirm the wedding dates ${s.pick(ESTIMATED)}.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'ESTIMATED' }]; },
    (s) => { const p = s.pick(PEOPLE); return [`Need to return ${p}'s ${s.pick(THINGS)} ${s.pick(EXPLICIT)}.`, { isCommitment: true, category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }]; },
    (s) => { const p = s.pick(PEOPLE), a = s.amount(); return [`${p} paid back the ${a.t} he owed me.`, { isCommitment: false, category: ['PERSONAL_PROMISE', 'PAYMENT'], counterparty: p, amountMinor: a.minor }]; },
  ],

  INFORMATIONAL: [
    (s) => [`Your OTP for login is ${100000 + Math.floor(s.r() * 899999)}. Do not share it with anyone.`, { isCommitment: false, amountMinor: null, deadlineKind: null }],
    (s) => { const m = s.pick(SHOPS); return [`Flat ${s.pick([30, 40, 50, 60, 70])}% off on everything at ${m} this weekend! Shop now.`, { isCommitment: false, deadlineKind: null }]; },
    (s) => { const m = s.pick(BANKS); return [`Your ${m} account statement for October is now available.`, { isCommitment: false, deadlineKind: null, amountMinor: null }]; },
    (s) => { const m = s.pick(SHOPS); return [`Thank you for shopping with ${m}! We hope to see you again.`, { isCommitment: false, deadlineKind: null }]; },
    (s) => [`Your password was changed successfully. If this wasn't you, contact support.`, { isCommitment: false, deadlineKind: null }],
    (s) => { const m = s.pick(SHOPS); return [`Happy Diwali from all of us at ${m}!`, { isCommitment: false, deadlineKind: null, amountMinor: null }]; },
    (s) => [`Congratulations! You have won a free voucher. Click the link to claim.`, { isCommitment: false, deadlineKind: null }],
    (s) => { const m = s.pick(TELCOS); return [`You have used 80% of your daily data on ${m}.`, { isCommitment: false, deadlineKind: null }]; },
    (s) => [`Hi, how are you? Long time no see!`, { isCommitment: false, deadlineKind: null, amountMinor: null, counterparty: null }],
    (s) => { const m = s.pick(BANKS); return [`${m}: ${s.pick([1, 2, 3])} new offers available on your credit card. Unsubscribe anytime.`, { isCommitment: false, deadlineKind: null }]; },
    (s) => [`Weather update: heavy rain expected in your area today.`, { isCommitment: false, amountMinor: null }],
    (s) => { const m = s.pick(SHOPS); return [`${m} newsletter: top picks for you this week.`, { isCommitment: false }]; },
  ],
};

/** Builds the dataset: per category, cycle through patterns with fresh slot values until `perCategory` unique texts. */
export function buildDataset(perCategory = 100, seed = 20261110) {
  const out = [];
  for (const [category, patterns] of Object.entries(P)) {
    const r = rng(seed + category.length * 7919);
    const s = { r, ...picker(r) };
    const seen = new Set();
    let i = 0;
    let guard = 0;
    while (seen.size < perCategory && guard++ < perCategory * 50) {
      const [text, expect] = patterns[i++ % patterns.length](s);
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ group: category, pattern: (i - 1) % patterns.length, text, expect });
    }
  }
  return out;
}
