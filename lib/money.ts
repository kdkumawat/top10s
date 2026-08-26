/**
 * Money utilities.
 *
 * Storage: bid amounts are stored as integer INR paise (1 INR = 100 paise).
 * Display: convert to USD at render time using a daily rate cached in Redis.
 * Falls back to a hardcoded estimate if the rate is unavailable.
 */

// Approximate INR → USD rate. Override via Redis cache `fx:INRUSD` (number).
const INR_USD_FALLBACK = 0.012; // 1 INR ≈ $0.012 (~83 INR/USD)

export type Money = {
  /** Minor units (paise) */
  paise: number;
  /** ISO 4217 code */
  currency: "INR";
};

/** Convert INR paise → USD cents (rounded) */
export function inrPaiseToUsdCents(paise: number, rate = INR_USD_FALLBACK): number {
  return Math.round((paise / 100) * rate * 100);
}

/** Format INR paise as a USD display string. */
export function formatUsdFromPaise(paise: number, rate = INR_USD_FALLBACK): string {
  const usdCents = inrPaiseToUsdCents(paise, rate);
  return formatUsdCents(usdCents);
}

/** Format USD cents as $X,XXX.XX (no decimals if .00). */
export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  const hasDecimals = dollars % 1 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/** Screen-reader-friendly USD amount. */
export function formatUsdCentsAria(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  if (remainder === 0) return `${dollars} dollars`;
  return `${dollars} dollars and ${remainder.toString().padStart(2, "0")} cents`;
}

/** Minimum bid for an empty cell: $1 = 100 USD cents → ~83 INR → ~8334 paise. */
export const MIN_EMPTY_BID_PAISE = Math.ceil(100 / INR_USD_FALLBACK); // ~8334 paise (~$1)
