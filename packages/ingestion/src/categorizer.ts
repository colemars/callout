import type { Category, CategorySource } from "@platform/financial-core";
import { isCategory } from "@platform/financial-core";
import type { CategorizeFn, UserRule } from "./types.js";

// Ported verbatim from callout's supabase/functions/_shared/plaid.ts —
// merchant-name heuristics outrank provider categories.
const DELIVERY_RE =
  /(doordash|door dash|uber\s*eats|grubhub|instacart|postmates|seamless|caviar|favor delivery)/i;
const COFFEE_RE = /(starbucks|dunkin|blue bottle|peet'?s|philz|dutch bros)/i;

/**
 * The key learned per-user rules match on: the merchant when the provider
 * gives one, else the raw description. Shared by the categorizer, the scribe,
 * and the recategorize endpoint so a correction always re-fires on the next
 * occurrence of the same merchant.
 */
export function normalizeMatchKey(merchant: string | null, description: string): string {
  return (merchant ?? description).toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Builds a categorizer from global provider-category rules plus a user's
 * learned rules. Precedence: user correction (law) → merchant heuristics →
 * global detailed → global primary → the scribe's learned rule → 'other'.
 */
export function createCategorizer(
  rules: ReadonlyMap<string, string>,
  userRules?: ReadonlyMap<string, UserRule>,
): CategorizeFn {
  const lookup = (key: string | null): Category | null => {
    if (key === null) return null;
    const mapped = rules.get(key);
    return mapped !== undefined && isCategory(mapped) ? mapped : null;
  };

  const userLookup = (
    matchKey: string,
    origin: CategorySource,
  ): { category: Category; source: CategorySource } | null => {
    const rule = userRules?.get(matchKey);
    return rule !== undefined && rule.origin === origin
      ? { category: rule.category, source: origin }
      : null;
  };

  return (detailed, primary, merchant, description) => {
    const matchKey = normalizeMatchKey(merchant, description);
    const corrected = userLookup(matchKey, "user");
    if (corrected !== null) return corrected;

    const label = `${merchant ?? ""} ${description}`;
    if (DELIVERY_RE.test(label)) return { category: "delivery", source: "rule" };
    if (COFFEE_RE.test(label)) return { category: "coffee", source: "rule" };

    const global = lookup(detailed) ?? lookup(primary);
    if (global !== null) return { category: global, source: "rule" };

    return userLookup(matchKey, "ai") ?? { category: "other", source: "rule" };
  };
}
