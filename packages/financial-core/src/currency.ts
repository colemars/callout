/** Currencies the platform understands. Extend deliberately; each needs a minor-unit exponent. */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD";

/** Number of minor-unit digits (cents) per currency. */
export const MINOR_UNIT_EXPONENT: Record<CurrencyCode, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
};
