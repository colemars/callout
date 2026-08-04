import { describe, expect, it } from "vitest";
import { createCategorizer, normalizeMatchKey } from "../src/categorizer.js";
import type { UserRule } from "../src/types.js";

const rules = new Map([
  ["FOOD_AND_DRINK_COFFEE", "coffee"],
  ["FOOD_AND_DRINK", "dining"],
  ["INCOME", "income"],
  ["BOGUS_TARGET", "not_a_real_category"],
]);
const categorize = createCategorizer(rules);

describe("categorizer (ported from callout mapCategory)", () => {
  it("merchant heuristics outrank provider categories", () => {
    expect(
      categorize("FOOD_AND_DRINK", "FOOD_AND_DRINK", "DoorDash", "DD DOORDASH BURGER"),
    ).toEqual({ category: "delivery", source: "rule" });
    expect(categorize(null, null, null, "UBER EATS PENDING")).toEqual({
      category: "delivery",
      source: "rule",
    });
    expect(categorize("INCOME", "INCOME", "Starbucks", "STARBUCKS 123")).toEqual({
      category: "coffee",
      source: "rule",
    });
  });

  it("falls back detailed -> primary -> other", () => {
    expect(categorize("FOOD_AND_DRINK_COFFEE", "FOOD_AND_DRINK", "Local Cafe", "CAFE")).toEqual({
      category: "coffee",
      source: "rule",
    });
    expect(categorize("FOOD_AND_DRINK_UNKNOWN", "FOOD_AND_DRINK", "Bistro", "BISTRO")).toEqual({
      category: "dining",
      source: "rule",
    });
    expect(categorize("UNKNOWN", "UNKNOWN", "Shop", "SHOP")).toEqual({
      category: "other",
      source: "rule",
    });
    expect(categorize(null, null, null, "MYSTERY")).toEqual({
      category: "other",
      source: "rule",
    });
  });

  it("ignores rules that map to invalid categories", () => {
    expect(categorize("BOGUS_TARGET", null, null, "X")).toEqual({
      category: "other",
      source: "rule",
    });
  });
});

describe("user rules precedence", () => {
  const userRules = new Map<string, UserRule>([
    ["starbucks", { category: "dining", origin: "user" }], // corrected: their Starbucks is meals
    ["mystery vault llc", { category: "transfer", origin: "ai" }],
    ["bistro", { category: "travel", origin: "ai" }],
  ]);
  const c = createCategorizer(rules, userRules);

  it("a user correction is law — beats even the merchant heuristics", () => {
    expect(c("INCOME", "INCOME", "Starbucks", "STARBUCKS 123")).toEqual({
      category: "dining",
      source: "user",
    });
  });

  it("ai-learned rules rank below global rules but above 'other'", () => {
    // Global rule wins over the ai rule for the same merchant.
    expect(c("FOOD_AND_DRINK_UNKNOWN", "FOOD_AND_DRINK", "Bistro", "BISTRO")).toEqual({
      category: "dining",
      source: "rule",
    });
    // Nothing else matches: the scribe's memory fills the gap.
    expect(c(null, null, null, "Mystery Vault LLC")).toEqual({
      category: "transfer",
      source: "ai",
    });
  });
});

describe("normalizeMatchKey", () => {
  it("prefers merchant, lowercases, collapses whitespace", () => {
    expect(normalizeMatchKey("  Blue   Bottle ", "ignored")).toBe("blue bottle");
    expect(normalizeMatchKey(null, "From HELOC  payback Vault")).toBe("from heloc payback vault");
  });
});
