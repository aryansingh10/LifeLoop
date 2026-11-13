/**
 * Parses amounts like "2,499", "₹1,00,000.50", "Rs. 499", "INR 12500".
 * Returns minor units (paise/cents) to avoid floating point money.
 */
export interface ParsedMoney {
  amountMinor: number;
  currency: string | null;
}

const CURRENCY_HINTS: Array<[RegExp, string]> = [
  [/₹|\brs\.?|\binr\b|rupees?/i, 'INR'],
  [/\$|\busd\b/i, 'USD'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
];

export function detectCurrency(text: string): string | null {
  for (const [re, code] of CURRENCY_HINTS) if (re.test(text)) return code;
  return null;
}

/** "5k" = 5,000; "1.5 lakh" = 1,50,000; "2 crore" = 2,00,00,000. */
const MULTIPLIERS: Array<[RegExp, number]> = [
  [/\b(?:crores?|cr)\b/i, 1e7],
  [/\b(?:lakhs?|lacs?)\b/i, 1e5],
  [/(?:\d\s?k\b|\bthousand\b|\bhazaa?r\b)/i, 1e3],
];

export function parseAmount(value: string): number | null {
  // Only the number itself: "Rs.1299.00" -> "1299.00" (the dot after "Rs" is not a decimal point).
  const numeric = value.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? '';
  if (!/\d/.test(numeric)) return null;
  // Indian and western grouping both use commas; a single dot is the decimal separator.
  const noGroup = numeric.replace(/,/g, '');
  const n = Number(noGroup);
  const multiplier = MULTIPLIERS.find(([re]) => re.test(value))?.[1] ?? 1;
  const total = n * multiplier;
  if (!Number.isFinite(total) || total <= 0 || total > 1e10) return null;
  return Math.round(total * 100);
}

export function parseMoney(value: string, evidence: string, modelCurrency: string | null): ParsedMoney | null {
  const amountMinor = parseAmount(value);
  if (amountMinor === null) return null;
  // Currency must be visible in the evidence; the model's guess alone is not trusted.
  const fromEvidence = detectCurrency(evidence);
  const currency = fromEvidence ?? (modelCurrency && evidence.toUpperCase().includes(modelCurrency.toUpperCase()) ? modelCurrency.toUpperCase() : null);
  return { amountMinor, currency };
}

export function formatMoney(amountMinor: number, currency: string | null): string {
  const value = amountMinor / 100;
  if (currency === 'INR') return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (currency) {
    try {
      return value.toLocaleString('en-US', { style: 'currency', currency });
    } catch {
      return `${currency} ${value}`;
    }
  }
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
