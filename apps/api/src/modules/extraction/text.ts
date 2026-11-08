/** Text helpers shared by capture normalization, evidence checks and matching. */

export const MAX_INPUT_CHARS = 8000;

/** Normalizes user input once at capture time. Never truncates silently (caller rejects long input). */
export function normalizeInput(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '') // zero-width characters
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Aggressive form used only for comparisons (case, quotes, dashes, whitespace). */
export function foldForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  return foldForCompare(text)
    .split(/[^\p{L}\p{N}₹]+/u)
    .filter((t) => t.length > 0);
}

/** Identifier values compare case-insensitively without separators: "403-1234 567" == "4031234567". */
export function normalizeIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const COMPANY_SUFFIXES = /\b(private|pvt|ltd|limited|inc|llp|india|in|co|corp|corporation|services?|customer care|support|team)\b\.?/g;

/** "Amazon.in Customer Support" -> "amazon" ; used for counterparty matching only. */
export function normalizeCounterparty(name: string): string {
  return foldForCompare(name)
    .replace(/\.(com|in|co\.in)\b/g, '')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard similarity over token sets, 0..1. */
export function tokenJaccard(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}
