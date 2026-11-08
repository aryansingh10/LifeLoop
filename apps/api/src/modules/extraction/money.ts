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

export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  // Indian and western grouping both use commas; a single dot is the decimal separator.
  const noGroup = cleaned.replace(/,/g, '');
  if ((noGroup.match(/\./g) ?? []).length > 1) return null;
  const n = Number(noGroup);
  if (!Number.isFinite(n) || n <= 0 || n > 1e10) return null;
  return Math.round(n * 100);
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
