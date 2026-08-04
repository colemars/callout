import type { Category } from "@platform/financial-core";
import { isCategory } from "@platform/financial-core";
import type { CategorizeFn } from "./types.js";

// Ported verbatim from callout's supabase/functions/_shared/plaid.ts —
// merchant-name heuristics outrank provider categories.
const DELIVERY_RE =
  /(doordash|door dash|uber\s*eats|grubhub|instacart|postmates|seamless|caviar|favor delivery)/i;
const COFFEE_RE = /(starbucks|dunkin|blue bottle|peet'?s|philz|dutch bros)/i;

/**
 * Builds a categorizer from provider-category rules (platform.category_rules
 * rows for one source). Lookup order: merchant heuristics, detailed category,
 * primary category, 'other'.
 */
export function createCategorizer(rules: ReadonlyMap<string, string>): CategorizeFn {
  const lookup = (key: string | null): Category | null => {
    if (key === null) return null;
    const mapped = rules.get(key);
    return mapped !== undefined && isCategory(mapped) ? mapped : null;
  };

  return (detailed, primary, merchant, description) => {
    const label = `${merchant ?? ""} ${description}`;
    if (DELIVERY_RE.test(label)) return "delivery";
    if (COFFEE_RE.test(label)) return "coffee";
    return lookup(detailed) ?? lookup(primary) ?? "other";
  };
}
