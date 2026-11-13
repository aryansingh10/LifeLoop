/**
 * Turns what Whisper writes for Hindi/Hinglish speech into Hinglish the way people type it in Roman letters:
 *   "कल मेरा मिंत्रा का एक रिफण आने वाला है पांसो रूपे का"  ->  "kal mera Myntra ka ek refund aane wala hai 500 rupees ka"
 *
 * 1. Known words first: brands, English loanwords Whisper writes in Hindi script (रिफंड -> refund) and common
 *    Hinglish words with their usual spelling (नहीं -> nahi, आएगा -> aayega).
 * 2. Everything else is transliterated letter by letter, dropping the silent "a" the way Hindi is spoken
 *    (करना -> karna, कल -> kal). Names get a capital when they sit before ne/ko/se/ka ("राहुल ने" -> "Rahul ne").
 * 3. Hindi number words become digits: "पाँच सौ" -> 500, "दो हज़ार" -> 2000 ("डेढ़ लाख" -> "1.5 lakh").
 * Latin words in the transcript (Whisper often writes "Amazon", "refund" as-is) are left alone.
 */

const LEXICON: Record<string, string> = {
  // brands
  अमेज़न: 'Amazon', अमेजन: 'Amazon', अमाजन: 'Amazon', अमेज़ॉन: 'Amazon', अमेजॉन: 'Amazon', अमेज़ोन: 'Amazon',
  फ्लिपकार्ट: 'Flipkart', फ्लिपकार्ड: 'Flipkart', फ़्लिपकार्ट: 'Flipkart', मिंत्रा: 'Myntra', मिन्त्रा: 'Myntra',
  स्विगी: 'Swiggy', ज़ोमैटो: 'Zomato', जोमैटो: 'Zomato', जोमाटो: 'Zomato', ज़ोमाटो: 'Zomato', ब्लिंकिट: 'Blinkit', ज़ेप्टो: 'Zepto', जेप्टो: 'Zepto',
  मीशो: 'Meesho', अजियो: 'Ajio', एजियो: 'Ajio', नायका: 'Nykaa', पेटीएम: 'Paytm', फोनपे: 'PhonePe', फ़ोनपे: 'PhonePe', एयरटेल: 'Airtel',
  जियो: 'Jio', बीएसएनएल: 'BSNL', एचडीएफसी: 'HDFC', आईसीआईसीआई: 'ICICI', एसबीआई: 'SBI', एक्सिस: 'Axis', कोटक: 'Kotak', ओला: 'Ola', उबर: 'Uber',
  ऊबर: 'Uber', रैपिडो: 'Rapido', आईआरसीटीसी: 'IRCTC', इंडिगो: 'IndiGo', मेकमायट्रिप: 'MakeMyTrip', सैमसंग: 'Samsung', एप्पल: 'Apple', डेल: 'Dell',
  एलजी: 'LG', क्रोमा: 'Croma', बिगबास्केट: 'BigBasket', लेंसकार्ट: 'Lenskart', डेकाथलॉन: 'Decathlon', रिलायंस: 'Reliance', अपोलो: 'Apollo',
  स्नैपडील: 'Snapdeal', जियोमार्ट: 'JioMart', नेटफ्लिक्स: 'Netflix', गूगल: 'Google', वनप्लस: 'OnePlus', शाओमी: 'Xiaomi', ओप्पो: 'Oppo', वीवो: 'Vivo',
  // English words Whisper writes in Hindi script
  रिफंड: 'refund', रिफ़ंड: 'refund', रिफण: 'refund', रिफण्ड: 'refund', रीफंड: 'refund', रिफन: 'refund', रिफंद: 'refund', रफंद: 'refund', रिफंड्स: 'refunds',
  ऑर्डर: 'order', आर्डर: 'order', ऑडर: 'order', डिलीवरी: 'delivery', डिलिवरी: 'delivery', डिलीवर: 'deliver', पार्सल: 'parcel', कूरियर: 'courier', कुरियर: 'courier',
  पैकेज: 'package', रिटर्न: 'return', कैंसल: 'cancel', कैंसिल: 'cancel', पेमेंट: 'payment', पेमेन्ट: 'payment', बिल: 'bill', बिल्स: 'bills', रेंट: 'rent',
  सैलरी: 'salary', लोन: 'loan', कार्ड: 'card', क्रेडिट: 'credit', डेबिट: 'debit', बैंक: 'bank', अकाउंट: 'account', ईएमआई: 'EMI', यूपीआई: 'UPI',
  ट्रांसफर: 'transfer', रिचार्ज: 'recharge', इंटरनेट: 'internet', वाईफाई: 'wifi', 'वाई-फाई': 'wifi', नेटवर्क: 'network', सिम: 'SIM',
  कंप्लेंट: 'complaint', कम्प्लेंट: 'complaint', कंप्लेन: 'complaint', शिकायत: 'complaint', टिकट: 'ticket', रिक्वेस्ट: 'request', इशू: 'issue',
  इश्यू: 'issue', प्रॉब्लम: 'problem', प्रोब्लम: 'problem', स्टेटस: 'status', अपडेट: 'update', पेंडिंग: 'pending', प्रोसेस: 'process', कॉल: 'call',
  मैसेज: 'message', ईमेल: 'email', ऐप: 'app', नंबर: 'number', ओटीपी: 'OTP', सर्विस: 'service', सेंटर: 'center', सेण्टर: 'center', रिपेयर: 'repair',
  टेक्नीशियन: 'technician', इंजीनियर: 'engineer', मैकेनिक: 'mechanic', प्लंबर: 'plumber', इलेक्ट्रीशियन: 'electrician', लैपटॉप: 'laptop', फोन: 'phone',
  फ़ोन: 'phone', मोबाइल: 'mobile', टीवी: 'TV', एसी: 'AC', फ्रिज: 'fridge', गीजर: 'geyser', वॉशिंग: 'washing', मशीन: 'machine',
  अपॉइंटमेंट: 'appointment', अपॉइन्टमेंट: 'appointment', डॉक्टर: 'doctor', डेंटिस्ट: 'dentist', हॉस्पिटल: 'hospital', क्लिनिक: 'clinic', चेकअप: 'checkup',
  इंटरव्यू: 'interview', मीटिंग: 'meeting', एचआर: 'HR', ऑफिस: 'office', कंपनी: 'company', डॉक्यूमेंट: 'document', डॉक्यूमेंट्स: 'documents',
  पैन: 'PAN', आधार: 'Aadhaar', पासपोर्ट: 'passport', केवाईसी: 'KYC', एग्रीमेंट: 'agreement', सर्टिफिकेट: 'certificate', फॉर्म: 'form', सबमिट: 'submit',
  अपलोड: 'upload', क्लेम: 'claim', इंश्योरेंस: 'insurance', रीइंबर्समेंट: 'reimbursement', रिम्बर्समेंट: 'reimbursement', मेडिक्लेम: 'mediclaim',
  रुपये: 'rupees', रूपये: 'rupees', रुपए: 'rupees', रूपए: 'rupees', रूपे: 'rupees', रुपे: 'rupees', रूपीस: 'rupees', रुपीस: 'rupees', रुपीज: 'rupees',
  रुपीज़: 'rupees', रुप्सी: 'rupees', रुपया: 'rupees', रूपया: 'rupees', रुपयों: 'rupees', रुपय: 'rupees',
  // common Hinglish words, spelled the usual way
  है: 'hai', हैं: 'hain', नहीं: 'nahi', नही: 'nahi', आया: 'aaya', आई: 'aayi', आए: 'aaye', आएगा: 'aayega', आएगी: 'aayegi', आयेगा: 'aayega',
  आयेगी: 'aayegi', आएंगे: 'aayenge', जाएगा: 'jayega', जाएगी: 'jayegi', जायेगा: 'jayega', जायेगी: 'jayegi', जाएंगे: 'jayenge', गया: 'gaya',
  गई: 'gayi', गयी: 'gayi', गए: 'gaye', हुआ: 'hua', हुई: 'hui', कल: 'kal', परसों: 'parso', आज: 'aaj', अभी: 'abhi', तक: 'tak', ने: 'ne', को: 'ko',
  से: 'se', में: 'me', मैं: 'main', मुझे: 'mujhe', मेरा: 'mera', मेरी: 'meri', मेरे: 'mere', वाला: 'wala', वाली: 'wali', वाले: 'wale', बजे: 'baje',
  शाम: 'shaam', सुबह: 'subah', दोपहर: 'dopahar', रात: 'raat', दिन: 'din', हफ्ते: 'hafte', हफ़्ते: 'hafte', हफ्ता: 'hafta', महीने: 'mahine',
  महीना: 'mahina', पैसे: 'paise', पैसा: 'paisa', वापस: 'wapas', उधार: 'udhaar', लौटाना: 'lautana', बोला: 'bola', बोली: 'boli', बोले: 'bole',
  कहा: 'kaha', दे: 'de', दिया: 'diya', दिए: 'diye', दिये: 'diye', किया: 'kiya', किए: 'kiye', किये: 'kiye', करना: 'karna', करने: 'karne',
  करवाना: 'karwana', भरना: 'bharna', जमा: 'jama', ठीक: 'theek', ख़राब: 'kharab', खराब: 'kharab', बंद: 'band', आने: 'aane', जाने: 'jaane',
  लेना: 'lena', देना: 'dena', भेजना: 'bhejna', भेजने: 'bhejne', भेज: 'bhej', मिलना: 'milna', मिला: 'mila', मिली: 'mili', मिल: 'mil', था: 'tha',
  थी: 'thi', थे: 'the', हो: 'ho', कब: 'kab', क्या: 'kya', भाई: 'bhai', यार: 'yaar', अगले: 'agle', अगला: 'agla', तारीख: 'tarikh', तारीख़: 'tarikh',
  बाद: 'baad', पहले: 'pehle', के: 'ke', की: 'ki', का: 'ka', और: 'aur', एक: 'ek', लिए: 'liye', लिये: 'liye', अपना: 'apna', अपनी: 'apni', रहा: 'raha',
  रही: 'rahi', रहे: 'rahe', चाहिए: 'chahiye', बताया: 'bataya', होगा: 'hoga', होगी: 'hogi', देगा: 'dega', देगी: 'degi', देंगे: 'denge',
  // numbers (also handled as words below)
  पांच: 'paanch', पाँच: 'paanch', पांसो: '500', पाँसौ: '500', पांचसौ: '500', पाँचसौ: '500', सौ: 'sau', हज़ार: 'hazaar', हजार: 'hazaar', लाख: 'lakh',
  करोड़: 'crore', डेढ़: 'dedh', ढाई: 'dhai', दो: 'do', तीन: 'teen', चार: 'chaar', छह: 'chhah', छः: 'chhah', सात: 'saat', आठ: 'aath',
  नौ: 'nau', दस: 'das', बीस: 'bees', पचास: 'pachaas', पंद्रह: 'pandrah', पन्द्रह: 'pandrah',
};

const VOWELS: Record<string, string> = { अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ऍ: 'e' };
const MATRAS: Record<string, string> = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th',
  द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l',
};
const NUKTA: Record<string, string> = { क: 'k', ख: 'kh', ग: 'g', ज: 'z', ड: 'r', ढ: 'rh', फ: 'f', य: 'y' };
const DIGITS: Record<string, string> = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const DEVANAGARI = /[ऀ-ॿ]/;

interface Syllable {
  c: string; // consonant(s), '' for a vowel on its own
  v: string; // vowel; 'a' when only the inherent vowel
  inherent: boolean; // vowel is the silent-able inherent "a"
  nasal: boolean;
  cluster: boolean; // consonant joined to the previous one (halant before it)
}

function transliterateWord(word: string): string {
  // Precomposed nukta letters (क़ ज़ फ़ …) decompose to base + ़ under NFD.
  const chars = [...word.normalize('NFD')];
  const syl: Syllable[] = [];
  let out = '';
  const flush = () => {
    // Drop the inherent "a" at the end (कल -> kal) unless the last consonant closes a cluster (मित्र -> mitra).
    const last = syl[syl.length - 1];
    if (syl.length > 1 && last.inherent && !last.nasal && !last.cluster) last.v = '';
    // Medial: V C a C V -> V C C V (करना -> karna, समझना -> samajhna), right to left, never the first syllable.
    for (let i = syl.length - 2; i >= 1; i--) {
      const s = syl[i];
      if (s.inherent && !s.nasal && s.c && syl[i + 1].c && syl[i + 1].v && syl[i - 1].v && !syl[i + 1].cluster) s.v = '';
    }
    out += syl.map((s) => s.c + s.v + (s.nasal ? 'n' : '')).join('');
    syl.length = 0;
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (CONSONANTS[ch]) {
      let c = next === '़' && NUKTA[ch] ? NUKTA[ch] : CONSONANTS[ch];
      if (next === '़') i++;
      const prev = syl[syl.length - 1];
      const cluster = Boolean(prev && prev.v === '' && !prev.inherent);
      // व is "w" before an "a" sound (वाला -> wala, वापस -> wapas), else "v" (विक्रम -> vikram).
      if (ch === 'व') c = chars[i + 1] === 'ा' || !MATRAS[chars[i + 1]] ? 'w' : 'v';
      syl.push({ c, v: 'a', inherent: true, nasal: false, cluster });
    } else if (MATRAS[ch] && syl.length) {
      Object.assign(syl[syl.length - 1], { v: MATRAS[ch], inherent: false });
    } else if (ch === '्' && syl.length) {
      Object.assign(syl[syl.length - 1], { v: '', inherent: false }); // halant
    } else if ((ch === 'ं' || ch === 'ँ') && syl.length) {
      syl[syl.length - 1].nasal = true;
    } else if (ch === 'ः' && syl.length) {
      syl[syl.length - 1].v += 'h';
    } else if (VOWELS[ch]) {
      syl.push({ c: '', v: VOWELS[ch], inherent: false, nasal: false, cluster: false });
    } else if (ch === '़' || ch === 'ऽ') {
      // stray nukta / avagraha
    } else {
      flush();
      out += DIGITS[ch] ?? (ch === '।' || ch === '॥' ? '.' : ch);
    }
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ numbers

const UNITS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, pachchis: 25, pachis: 25, tees: 30,
  chalis: 40, chaalis: 40, pachas: 50, pachaas: 50, dedh: 1.5, dhai: 2.5,
};
const UNIT = `(?:${Object.keys(UNITS).join('|')}|\\d+(?:\\.\\d+)?)`;
const num = (w: string) => UNITS[w] ?? Number(w);

/** "paanch sau" -> 500, "do hazaar paanch sau" -> 2500, "dedh lakh" -> "1.5 lakh", "paanch rupees" -> "5 rupees". */
export function hindiNumbersToDigits(text: string): string {
  return text
    .replace(new RegExp(`\\b(${UNIT}) (lakh|crore)\\b`, 'gi'), (_, n: string, unit: string) => `${num(n.toLowerCase())} ${unit}`)
    .replace(new RegExp(`\\b(${UNIT}) (?:hazaa?r|hajaa?r)(?: (${UNIT}) sau)?(?: (${UNIT}))?\\b`, 'gi'), (_, a: string, b?: string, c?: string) =>
      String(num(a.toLowerCase()) * 1000 + (b ? num(b.toLowerCase()) * 100 : 0) + (c && !b ? 0 : c ? num(c.toLowerCase()) : 0)),
    )
    .replace(new RegExp(`\\b(${UNIT}) sau(?: (${UNIT}))?\\b`, 'gi'), (_, a: string, b?: string) => String(num(a.toLowerCase()) * 100 + (b ? num(b.toLowerCase()) : 0)))
    .replace(new RegExp(`\\b(${UNIT}) (rupees|rupaye|rupay|rs)\\b`, 'gi'), (_, a: string, r: string) => `${num(a.toLowerCase())} ${r}`);
}

// ------------------------------------------------------------------ main

const POSTPOSITION = /^(?:ne|ko|se|ka|ki|ke|ji|wale|wala|wali)$/;
/** Lexicon keyed by NFC form, so "ज़" typed as one code point or as "ज" + nukta both match. */
const LEX = new Map(Object.entries(LEXICON).map(([k, v]) => [k.normalize('NFC'), v]));

/** Hindi-script (and mixed) transcript -> Roman Hinglish. Text without Hindi script is returned unchanged. */
export function romanizeHinglish(text: string): string {
  if (!DEVANAGARI.test(text)) return text;
  const tokens = text.split(/(\s+|[,.!?;:।॥"“”()]+)/);
  const generated = new Set<number>(); // tokens produced by letter-by-letter transliteration
  const out = tokens.map((tok, i) => {
    if (!tok || !DEVANAGARI.test(tok)) return tok;
    const key = tok.normalize('NFC');
    const known = LEX.get(key);
    if (known) return known;
    generated.add(i);
    return transliterateWord(key);
  });
  // A transliterated word right before ne/ko/se/ka… is most likely a name: "rahul ne" -> "Rahul ne".
  for (const i of generated) {
    let j = i + 1;
    while (j < out.length && /^\s*$/.test(out[j])) j++;
    if (j < out.length && POSTPOSITION.test(out[j].toLowerCase()) && out[i].length > 2) out[i] = out[i].charAt(0).toUpperCase() + out[i].slice(1);
  }
  return hindiNumbersToDigits(out.join(''));
}
