// Blind check: templates written AFTER the large-set tuning, with new wording and some brands that are not in
// the extractor's dictionary. Run it before changing rules for anything it finds, and report that number
// as the honest "unseen phrasing" estimate.
import { buildFrom } from './large.mjs';

const SHOPS = ['Bata', 'Titan', 'Tanishq', 'Nike', 'Puma', 'H&M', 'Zara', 'Uniqlo', 'Hamleys', 'Poorvika', 'Sangeetha Mobiles', 'Amazon', 'Flipkart', 'Myntra', 'Meesho'];
const TRAVEL = ['IRCTC', 'IndiGo', 'Uber', 'redBus', 'Ixigo', 'Abhibus', 'Zoomcar'];
const TELCOS = ['Airtel', 'Jio', 'Vi', 'ACT Fibernet', 'Hathway', 'You Broadband', 'Spectra'];
const UTIL = ['BESCOM', 'Tata Power', 'BSES', 'Torrent Power', 'MGVCL', 'TSSPDCL'];
const BANKS = ['HDFC Bank', 'SBI', 'Axis Bank', 'Kotak', 'Federal Bank', 'Canara Bank', 'Paytm'];
const BRANDS = ['Samsung', 'LG', 'Whirlpool', 'Bosch', 'IFB', 'Croma', 'Lloyd', 'Onida', 'Videocon', 'Symphony'];
const ITEMS = ['washing machine', 'laptop', 'phone', 'AC', 'fridge', 'TV', 'mixer', 'induction'];
const HOSP = ['Apollo', 'Fortis', 'Manipal', 'Sankara Nethralaya', 'Cloudnine', 'Motherhood'];
const LABS = ['Thyrocare', 'Metropolis', 'Orange Health', 'Tata 1mg Labs'];
const INS = ['Star Health', 'HDFC Ergo', 'Niva Bupa', 'Aditya Birla Health', 'ManipalCigna'];
const COS = ['Infosys', 'Zoho', 'Mindtree', 'Persistent', 'Thoughtworks'];
const CARS = ['Maruti', 'Hyundai', 'Tata Motors', 'Kia'];
const PEOPLE = ['Rahul', 'Priya', 'Aman', 'Nisha', 'Varun', 'Sanjana', 'Kabir', 'Ira', 'Mohit', 'Tara', 'Dev Malhotra', 'Rhea Sen'];
const DOCS = ['Sharma', 'Pillai', 'Desai', 'Bose'];
const THINGS = ['trolley bag', 'ladder', 'guitar', 'projector', 'textbook', 'helmet'];
const TICKETS = ['SR778812', 'GRV-22019', 'TKT90011', '#55102'];
const PAST = ['yesterday', 'last week', 'on Monday', 'two days ago'];
const EX = ['by Friday', 'tomorrow', 'on Monday', 'by 22 Nov', 'this Sunday', 'day after tomorrow', 'by Nov 30'];
const EST = ['within 5 days', 'in 3-5 working days', 'next week', 'in a few days', 'within 72 hours', 'in 10 days'];
const EXH = ['kal tak', 'Saturday tak', 'parso tak', '28 Nov tak', 'aaj raat tak'];
const ESTH = ['3 din me', 'ek hafte me', 'agle hafte', 'do din me'];
const DAYS = ['tomorrow', 'on Friday', 'on 21 Nov', 'this Thursday'];
const TIMES = ['11 am', '3:30 pm', '9 a.m', '7pm'];
const HDAYS = ['kal', 'Sunday ko', 'parso'];
const HTIMES = ['subah 8 baje', 'shaam 6 baje', '11 baje'];
const VALUES = [250, 640, 1199, 3450, 7999, 12500, 56000];
const inr = (v) => v.toLocaleString('en-IN');
const brand = (n) => n; // counterparty label helper (kept for readability)

function amt(s) {
  const v = s.pick(VALUES);
  const t = s.pick([`₹${inr(v)}`, `Rs ${v}`, `Rs.${inr(v)}`, `${v} rupees`, `INR ${inr(v)}`]);
  return { t, minor: v * 100 };
}

const en = (fn) => ['en', fn];
const hi = (fn) => ['hi', fn];
const C = (o) => ({ isCommitment: true, ...o });
const N = (o) => ({ isCommitment: false, ...o });

export const BLIND = {
  REFUND: [
    en((s) => { const m = s.pick(SHOPS); return [`Raised a return for the shoes on ${m}, money not back yet.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: brand(m) }), 'brand']; }),
    en((s) => { const m = s.pick(SHOPS), a = amt(s); return [`${m} has approved my return. The refund amount ${a.t} will be added to my wallet ${s.pick(EST)}.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }), 'brand']; }),
    hi((s) => { const m = s.pick(SHOPS), a = amt(s); return [`Bro ${m} se paise wapas kab aayenge? ${a.t} ka order cancel kiya tha`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor }), 'brand']; }),
    en((s) => { const m = s.pick(SHOPS), a = amt(s); return [`Got an email that my ${m} refund of ${a.t} is on hold.`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m, amountMinor: a.minor }), 'brand']; }),
    en((s) => { const m = s.pick(TRAVEL), a = amt(s); return [`${m} refund credited: ${a.t}. Thank you for choosing ${m}.`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor }), 'brand']; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} wale refund de nahi rahe, ${s.pick([3, 4, 5])} baar call kar chuka`, C({ category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: m }), 'brand']; }),
    hi((s) => { const m = s.pick(SHOPS), a = amt(s); return [`Refund aa gaya ${m} ka, ${a.t}`, N({ category: 'REFUND', counterparty: m, amountMinor: a.minor }), 'brand']; }),
  ],
  PAYMENT: [
    en((s) => { const a = amt(s); return [`Have to transfer ${a.t} to the landlord ${s.pick(EX)}.`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(UTIL), a = amt(s); return [`${m} electricity bill ${a.t}, last date ${s.pick(['20 Nov', '25/11/2026', 'Nov 24'])}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, amountMinor: a.minor, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const m = s.pick(BANKS); return [`Reminder to self: pay the ${m} card bill ${s.pick(EX)}.`, C({ category: 'PAYMENT', waitingOn: 'USER', counterparty: m, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const p = s.pick(PEOPLE), a = amt(s); return [`${p} hasn't sent the ${a.t} for the trip yet.`, C({ category: ['PAYMENT', 'PERSONAL_PROMISE'], waitingOn: 'OTHER_PARTY', counterparty: p, amountMinor: a.minor }), 'person']; }),
    en((s) => { const c = s.pick(COS), a = amt(s); return [`Freelance payment of ${a.t} from ${c} expected ${s.pick(EST)}.`, C({ category: 'PAYMENT', waitingOn: 'OTHER_PARTY', counterparty: c, amountMinor: a.minor, deadlineKind: 'ESTIMATED' }), 'brand']; }),
    hi((s) => { const a = amt(s); return [`Bijli ka bill ${a.t} aaya hai, ${s.pick(EXH)} jama karna hai`, C({ category: 'PAYMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'EXPLICIT' })]; }),
    en((s) => { const m = s.pick(UTIL), a = amt(s); return [`Paid ${m} bill ${a.t} via UPI, successful.`, N({ category: 'PAYMENT', counterparty: m, amountMinor: a.minor }), 'brand']; }),
    hi((s) => { const p = s.pick(PEOPLE), a = amt(s); return [`Maine ${p} ko ${a.t} bhej diye`, N({ category: ['PAYMENT', 'PERSONAL_PROMISE'], amountMinor: a.minor })]; }),
  ],
  REPAIR: [
    en((s) => { const b = s.pick(BRANDS); return [`Washing machine drum is making noise, ${b} technician visit booked for ${s.pick(['tomorrow', 'Friday', '21 Nov'])}.`, C({ category: ['REPAIR', 'APPOINTMENT', 'SERVICE_REQUEST'], counterparty: b, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const b = s.pick(BRANDS), i = s.pick(ITEMS); return [`Sent my ${i} to ${b} for screen repair, estimated time ${s.pick(EST)}.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: b, deadlineKind: 'ESTIMATED' }), 'brand']; }),
    hi((s) => { const b = s.pick(BRANDS), i = s.pick(ITEMS); return [`${b} ne ${i} ka part order kiya hai, ${s.pick(ESTH)} aayega`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: b, deadlineKind: 'ESTIMATED' }), 'brand']; }),
    hi((s) => { const i = s.pick(ITEMS), a = amt(s); return [`${i} ki repair ho gayi, ${a.t} lage`, N({ category: 'REPAIR', amountMinor: a.minor })]; }),
    en((s) => { const c = s.pick(CARS); return [`Car brakes are making noise, need to take it to the ${c} service station ${s.pick(EX)}.`, C({ category: 'REPAIR', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const i = s.pick(ITEMS); return [`The carpenter still hasn't fixed the ${s.pick(['wardrobe door', 'bed frame', 'kitchen shelf'])}.`, C({ category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: null })]; }),
  ],
  DELIVERY: [
    en((s) => { const m = s.pick(SHOPS); return [`Tracking shows my ${m} package reached the local hub, delivery expected ${s.pick(EX)}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const m = s.pick(SHOPS); return [`${m} order still showing packed for ${s.pick([3, 5, 6])} days.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: null }), 'brand']; }),
    en((s) => { const m = s.pick(SHOPS); return [`Delivery attempt failed for my ${m} order, they'll retry ${s.pick(EX)}.`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    hi((s) => { const m = s.pick(SHOPS); return [`${m} ka saman aaj aane wala tha, abhi tak nahi aaya`, C({ category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: m }), 'brand']; }),
    en((s) => { const m = s.pick(SHOPS); return [`Received my ${m} order, all items intact.`, N({ category: 'DELIVERY', counterparty: m }), 'brand']; }),
    hi((s) => { const m = s.pick(SHOPS); return [`Courier wala ${s.pick(EXH)} aayega ${m} ka return lene`, C({ category: ['DELIVERY', 'REFUND'], waitingOn: 'OTHER_PARTY', counterparty: m, deadlineKind: 'EXPLICIT' }), 'brand']; }),
  ],
  APPOINTMENT: [
    en((s) => { const h = s.pick(HOSP); return [`Eye checkup at ${h} ${s.pick(DAYS)} at ${s.pick(TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: h, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const l = s.pick(LABS); return [`Blood test tomorrow morning at ${l}, need to fast for 10 hours.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: l, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Team sync with ${p} moved to ${s.pick(DAYS)} at ${s.pick(TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => [`${s.pick(HDAYS)} ${s.pick(HTIMES)} dentist ke paas jana hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const c = s.pick(CARS); return [`Your slot for the ${c} test drive is confirmed for ${s.pick(DAYS)}, ${s.pick(TIMES)}.`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const d = s.pick(DOCS); return [`Consultation with Dr. ${d} went well, next visit in 3 months.`, N({ category: 'APPOINTMENT', counterparty: d })]; }),
    hi((s) => { const c = s.pick(COS); return [`${c} ka HR round ${s.pick(HDAYS)} ${s.pick(HTIMES)} hai`, C({ category: 'APPOINTMENT', waitingOn: 'USER', counterparty: c, deadlineKind: 'EXPLICIT' }), 'brand']; }),
  ],
  SERVICE_REQUEST: [
    en((s) => { const b = s.pick(BANKS); return [`Lodged a grievance with ${b} regarding an unauthorised transaction, ref ${s.pick(TICKETS)}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: b }), 'brand']; }),
    en((s) => { const t = s.pick(TELCOS); return [`${t} said the technician will fix the fibre line ${s.pick(EX)}.`, C({ category: ['SERVICE_REQUEST', 'REPAIR'], waitingOn: 'OTHER_PARTY', counterparty: t, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    en((s) => { const t = s.pick(TELCOS); return [`Still no resolution from ${t} on ticket ${s.pick(TICKETS)}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: t }), 'brand']; }),
    hi((s) => { const b = s.pick(BANKS); return [`${b} ka net banking band hai, request daali hai`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: b }), 'brand']; }),
    en((s) => { const t = s.pick(TELCOS); return [`${t} issue resolved, thanks for the help.`, N({ category: 'SERVICE_REQUEST', counterparty: t }), 'brand']; }),
    en((s) => { const t = s.pick(TELCOS); return [`Port request to ${t} submitted, activation ${s.pick(EST)}.`, C({ category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: t, deadlineKind: 'ESTIMATED' }), 'brand']; }),
  ],
  DOCUMENT: [
    en((s) => [`Landlord needs a copy of my Aadhaar ${s.pick(EX)}.`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => { const p = s.pick(PEOPLE); return [`Waiting on ${p} to sign the lease papers.`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', counterparty: p }), 'person']; }),
    en((s) => [`Birth certificate application submitted at the municipal office, can collect it ${s.pick(EST)}.`, C({ category: 'DOCUMENT', deadlineKind: 'ESTIMATED' })]),
    hi((s) => [`Bank ne address proof maanga hai, ${s.pick(EXH)} dena hai`, C({ category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' })]),
    en((s) => [`Got my new PAN card in the mail today.`, N({ category: 'DOCUMENT' })]),
    en((s) => [`University will mail the transcripts ${s.pick(EST)}.`, C({ category: 'DOCUMENT', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' })]),
  ],
  REIMBURSEMENT: [
    en((s) => { const a = amt(s); return [`Expense report for the Pune trip (${a.t}) still awaiting finance approval.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: a.minor })]; }),
    en((s) => { const i = s.pick(INS); return [`${i} asked for more documents for my claim, have to send them ${s.pick(EX)}.`, C({ category: ['REIMBURSEMENT', 'DOCUMENT'], waitingOn: 'USER', counterparty: i, deadlineKind: 'EXPLICIT' }), 'brand']; }),
    hi((s) => { const a = amt(s); return [`Company ne ${a.t} reimburse kar diya`, N({ category: 'REIMBURSEMENT', amountMinor: a.minor })]; }),
    en((s) => { const i = s.pick(INS); return [`Cashless approval for the surgery is pending with ${i}.`, C({ category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: i }), 'brand']; }),
    en((s) => { const a = amt(s); return [`Submit the phone bill claim of ${a.t} before month end.`, C({ category: 'REIMBURSEMENT', waitingOn: 'USER', amountMinor: a.minor, deadlineKind: 'ESTIMATED' })]; }),
  ],
  PERSONAL_PROMISE: [
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`${p} borrowed my ${t} last week, said he'd return it ${s.pick(EX)}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE); return [`Promised ${p} I'll help with the shifting ${s.pick(EX)}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    hi((s) => { const p = s.pick(PEOPLE); return [`${p} ne kaha tha ${s.pick(EXH)} call karega`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'OTHER_PARTY', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`Got my ${t} back from ${p}.`, N({ category: 'PERSONAL_PROMISE', counterparty: p }), 'person']; }),
    en((s) => { const p = s.pick(PEOPLE), t = s.pick(THINGS); return [`Need to give ${p} back the ${t} ${s.pick(EX)}.`, C({ category: 'PERSONAL_PROMISE', waitingOn: 'USER', counterparty: p, deadlineKind: 'EXPLICIT' }), 'person']; }),
  ],
  INFORMATIONAL: [
    en((s) => { const m = s.pick(SHOPS); return [`Win exciting prizes! Take part in the ${m} quiz now.`, N({ deadlineKind: null })]; }),
    en((s) => { const t = s.pick(TELCOS); return [`Your number has been successfully ported to ${t}.`, N({ deadlineKind: null })]; }),
    hi((s) => [`Lunch ho gaya?`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
    en((s) => [`Thank you for your feedback!`, N({ deadlineKind: null, amountMinor: null })]),
    en((s) => [`New features are available in the app. Update now!`, N({ deadlineKind: null })]),
    en((s) => [`Your EPF passbook has been updated.`, N({ deadlineKind: null, amountMinor: null })]),
    hi((s) => [`Bhai match dekha kal?`, N({ deadlineKind: null, amountMinor: null, counterparty: null })]),
  ],
};

/** 10 categories × `per` messages from the blind templates (with the same WhatsApp-style noise). */
export function buildBlind(per = 1000) {
  // Brands outside the dictionary can't be recognised in all-lowercase text either; treat like names.
  return buildFrom(BLIND, per * Object.keys(BLIND).length, 777, { skipLowerFor: ['person', 'brand'] });
}
