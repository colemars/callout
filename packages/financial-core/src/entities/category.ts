/**
 * The platform's unified category vocabulary (originally seeded from callout's
 * category_map). Provider-specific categories are normalized to these at ingestion.
 */
export const CATEGORIES = [
  "groceries",
  "dining",
  "delivery",
  "coffee",
  "transport",
  "shopping",
  "subscriptions",
  "entertainment",
  "travel",
  "health",
  "housing",
  "debt_payment",
  "income",
  "transfer",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(s: string): s is Category {
  return (CATEGORIES as readonly string[]).includes(s);
}

/** Categories excluded from spending metrics (they move money, not consume it). */
export const NON_SPENDING_CATEGORIES: readonly Category[] = ["transfer", "debt_payment", "income"];
