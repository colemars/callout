import { describe, expect, it } from "vitest";
import { isoDate, isoMonth } from "../src/dates/local-date.js";
import { type FinancialEvent, assertNever } from "../src/events/events.js";
import { goalId, userId } from "../src/ids.js";
import { money } from "../src/money/money.js";

const base = { userId: userId("u1"), occurredOn: isoDate("2026-08-03") };

describe("FinancialEvent", () => {
  it("narrows by discriminant", () => {
    const e: FinancialEvent = {
      ...base,
      type: "GOAL_OFF_TRACK",
      goalId: goalId("g1"),
      expected: money(50_000),
      actual: money(32_000),
      shortfall: money(18_000),
    };
    if (e.type === "GOAL_OFF_TRACK") {
      expect(e.shortfall.amountMinor).toBe(18_000);
    } else {
      throw new Error("narrowing failed");
    }
  });

  it("payloads carry the numbers needed to explain themselves", () => {
    const spending: FinancialEvent = {
      ...base,
      type: "MONTHLY_SPENDING_INCREASED",
      category: "delivery",
      month: isoMonth("2026-08"),
      previous: money(-15_000),
      current: money(-24_050),
      deltaPct: 60.3,
    };
    expect(spending.previous).toBeDefined();
    expect(spending.current).toBeDefined();
    expect(spending.deltaPct).toBeCloseTo(60.3);

    const runway: FinancialEvent = {
      ...base,
      type: "EMERGENCY_RUNWAY_CHANGED",
      previousMonths: 4.2,
      currentMonths: 3.1,
    };
    expect(runway.currentMonths).toBeLessThan(runway.previousMonths);
  });

  it("assertNever enforces exhaustive handling (and throws at runtime)", () => {
    const label = (e: FinancialEvent): string => {
      switch (e.type) {
        case "GOAL_OFF_TRACK":
        case "GOAL_ON_TRACK":
          return "goal";
        case "MONTHLY_SPENDING_INCREASED":
        case "MONTHLY_SPENDING_DECREASED":
          return "spending";
        case "RECURRING_EXPENSE_ADDED":
        case "RECURRING_EXPENSE_REMOVED":
          return "recurring";
        case "HIGH_INTEREST_DEBT_INCREASED":
        case "HIGH_INTEREST_DEBT_DECREASED":
          return "debt";
        case "NET_CASH_FLOW_NEGATIVE":
        case "NET_CASH_FLOW_POSITIVE":
          return "cashflow";
        case "PASSIVE_INCOME_INCREASED":
          return "income";
        case "RETIREMENT_CONTRIBUTION_MADE":
        case "RETIREMENT_CONTRIBUTION_INCREASED":
          return "retirement";
        case "EMERGENCY_RUNWAY_CHANGED":
          return "runway";
        default:
          return assertNever(e); // compile error here if a variant is unhandled
      }
    };
    expect(
      label({
        ...base,
        type: "NET_CASH_FLOW_NEGATIVE",
        month: isoMonth("2026-08"),
        netFlow: money(-42_000),
      }),
    ).toBe("cashflow");
    expect(() => assertNever({ type: "BOGUS" } as never)).toThrow(/Unhandled/);
  });
});
