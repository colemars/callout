import { describe, expect, it } from "vitest";
import { createCategorizer } from "../src/categorizer.js";

const rules = new Map([
  ["FOOD_AND_DRINK_COFFEE", "coffee"],
  ["FOOD_AND_DRINK", "dining"],
  ["INCOME", "income"],
  ["BOGUS_TARGET", "not_a_real_category"],
]);
const categorize = createCategorizer(rules);

describe("categorizer (ported from callout mapCategory)", () => {
  it("merchant heuristics outrank provider categories", () => {
    expect(categorize("FOOD_AND_DRINK", "FOOD_AND_DRINK", "DoorDash", "DD DOORDASH BURGER")).toBe(
      "delivery",
    );
    expect(categorize(null, null, null, "UBER EATS PENDING")).toBe("delivery");
    expect(categorize("INCOME", "INCOME", "Starbucks", "STARBUCKS 123")).toBe("coffee");
  });

  it("falls back detailed -> primary -> other", () => {
    expect(categorize("FOOD_AND_DRINK_COFFEE", "FOOD_AND_DRINK", "Local Cafe", "CAFE")).toBe(
      "coffee",
    );
    expect(categorize("FOOD_AND_DRINK_UNKNOWN", "FOOD_AND_DRINK", "Bistro", "BISTRO")).toBe(
      "dining",
    );
    expect(categorize("UNKNOWN", "UNKNOWN", "Shop", "SHOP")).toBe("other");
    expect(categorize(null, null, null, "MYSTERY")).toBe("other");
  });

  it("ignores rules that map to invalid categories", () => {
    expect(categorize("BOGUS_TARGET", null, null, "X")).toBe("other");
  });
});
