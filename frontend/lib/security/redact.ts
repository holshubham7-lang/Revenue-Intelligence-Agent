/**
 * Deterministic redaction for text on its way into the knowledge base.
 *
 * The rule this enforces: **only system-generated text is eligible for
 * indexing** — action plans, diagnoses, profile summaries. User answers and
 * uploaded file rows are never candidates.
 *
 * That rule alone is not sufficient, because system output is *derived* from
 * those inputs. A model's rationale can easily quote "Deal Northwind
 * Expansion ($480k) sat in Negotiation for 74 days", which reintroduces exactly
 * the identifiers the rule exists to keep out — and does so without a filter in
 * front of it, in a store that is then semantically queried.
 *
 * So every chunk passes through here before it is stored. Two tiers:
 *
 *   1. Literal  — exact values we already know (company name, entity names,
 *                 contact names harvested from the upload). Deterministic and
 *                 fully reliable; the caller must pass what it has.
 *   2. Pattern  — classes that are recognisable without a model: emails,
 *                 phone numbers, currency amounts, long digit runs, URLs with
 *                 hostnames, bearer tokens.
 *
 * Percentages, durations, stage names, and counts are deliberately **kept** —
 * they are the substance of the insight. Only the identifying and absolute
 * value-bearing parts go.
 *
 * `redact` reports how much it removed. Callers use `clean` to drop a chunk
 * that was mostly secrets: a chunk that is 40% redacted is not a useful
 * memory, and a partially-redacted chunk is the worst outcome — it looks safe
 * while still leaking shape.
 */

/**
 * Absolute money, in all four orderings that appear in CRM exports:
 * symbol-first ("$480,000"), code-first ("USD 480,000"), spaced code
 * ("USD 480,000"), and compact code ("USD480,000"). Missing the code-first form
 * is an easy and total miss — a European or APAC export uses it constantly.
 */
const CURRENCY_PATTERNS: readonly RegExp[] = [
  /[$€£₹¥]\s?\d[\d,]*(?:\.\d+)?/g,
  /\b(?:USD|EUR|GBP|INR|AUD|CAD|JPY|CHF|SEK)\s?\d[\d,]*(?:\.\d+)?\b/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|INR|AUD|CAD|JPY|CHF|SEK)\b/gi,
];

/** Trailing-digit runs long enough to be an account, card, or phone fragment. */
const LONG_DIGITS = /\b\d{7,}\b/g;

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Deliberately loose: an over-redacted phone number is an acceptable cost. */
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

/**
 * A date range reads exactly like a phone number to `PHONE` — "2024-10-05 to
 * 2025-01-10" is digits, hyphens, and spaces in the right lengths.
 *
 * That cost is *not* acceptable here. Redacting a phone number loses an
 * identifier; redacting a date range destroys the time context that makes a
 * pipeline insight true ("these deals are stale", "closed in Q1"). A memory that
 * has had its dates stripped is confidently wrong, so `PHONE` matches that
 * contain a date are exempted below.
 */
const ISO_DATE_SHAPE = /\d{4}-\d{2}-\d{2}/;

/** URL carrying a hostname, which for a CRM export is usually the account's. */
const URL_WITH_HOST = /\bhttps?:\/\/[^\s<>"]+/gi;

const BEARER = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g;

const PLACEHOLDER = "[redacted]";

export type RedactResult = {
  /** Text with every match replaced by `PLACEHOLDER`. */
  text: string;
  /** Number of spans replaced. */
  redactions: number;
  /** Characters consumed by those spans, measured before replacement. */
  removedChars: number;
  /**
   * True when the result is dense enough to still be worth storing. False means
   * the chunk was overwhelmingly identifying content — drop it rather than
   * index a husk.
   */
  clean: boolean;
  /** Distinct pattern classes that fired, for logging/auditing. */
  categories: string[];
};

export type RedactOptions = {
  /**
   * Exact strings to remove — company name, entity names, contact names. Longer
   * values are matched first so "Northwind" does not pre-empt "Northwind
   * Expansion". Case-insensitive.
   */
  literals?: readonly string[];
  /**
   * Fraction of the *original* text consumed by redactions above which `clean`
   * is false. 0.35 keeps a chunk only if the majority of it survived intact.
   */
  maxRedactedRatio?: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applies one pattern, returning the rewritten text plus how many matches fired
 * and how many characters they consumed.
 *
 * `keep` exempts a match from replacement without counting it as a redaction —
 * used where a pattern is genuinely ambiguous and the context decides.
 */
function applyPattern(
  input: string,
  pattern: RegExp,
  replacement: string,
  keep: (match: string) => boolean = () => false,
): {
  text: string;
  count: number;
  removedChars: number;
} {
  let count = 0;
  let removedChars = 0;
  // A fresh RegExp per call: these module-level patterns carry `g` state, and
  // `lastIndex` leaking between calls would silently skip matches.
  const re = new RegExp(pattern.source, pattern.flags);
  const text = input.replace(re, (match: string) => {
    if (keep(match)) return match;
    count += 1;
    removedChars += match.length;
    return replacement;
  });
  return { text, count, removedChars };
}

/**
 * Removes identifying values and absolute figures from `input`.
 *
 * Density is measured as `characters actually removed / original length`, not as
 * a share of the placeholder text. Measuring the placeholder instead would make
 * the verdict depend on chunk length and on the length of the marker string —
 * the same three redactions would condemn a one-line sentence and pass a long
 * paragraph, which is not a useful signal.
 */
export function redact(input: string, options: RedactOptions = {}): RedactResult {
  const { literals = [], maxRedactedRatio = 0.35 } = options;

  const originalLength = input.length;
  let text = input;
  let redactions = 0;
  let removedChars = 0;
  const categories: string[] = [];

  const tally = (count: number, chars: number) => {
    redactions += count;
    removedChars += chars;
  };

  // Longest literal first: prevents a short literal from consuming the prefix
  // of a longer one and leaving a dangling fragment.
  const ordered = [...literals]
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const literal of ordered) {
    const result = applyPattern(text, new RegExp(escapeRegExp(literal), "gi"), PLACEHOLDER);
    if (result.count > 0) {
      text = result.text;
      tally(result.count, result.removedChars);
      if (!categories.includes("literal")) categories.push("literal");
    }
  }

  const patterns: readonly (readonly [RegExp, string, ((match: string) => boolean)?])[] = [
    [EMAIL, "email"],
    [BEARER, "token"],
    [URL_WITH_HOST, "url"],
    ...CURRENCY_PATTERNS.map((re) => [re, "currency"] as const),
    [PHONE, "phone", (match) => ISO_DATE_SHAPE.test(match)],
    [LONG_DIGITS, "long_digits"],
  ];

  for (const [pattern, category, keep] of patterns) {
    const result = applyPattern(text, pattern, PLACEHOLDER, keep);
    if (result.count > 0) {
      text = result.text;
      tally(result.count, result.removedChars);
      if (!categories.includes(category)) categories.push(category);
    }
  }

  const ratio = originalLength === 0 ? 0 : removedChars / originalLength;

  return {
    text,
    redactions,
    removedChars,
    clean: ratio <= maxRedactedRatio,
    categories,
  };
}
