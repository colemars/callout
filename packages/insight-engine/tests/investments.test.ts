import { isoDate, money } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import { AS_OF, emptyState, investmentActivity } from "./fixtures.js";

const cfg = defaultEngineConfig;

// AS_OF = 2026-08-15: completed month = 2026-07, prior = 2026-06.
const state = () =>
  emptyState({
    investmentActivity: [
      investmentActivity({ date: "2026-08-05", amountMinor: 70_000, kind: "contribution" }),
      investmentActivity({ date: "2026-07-15", amountMinor: 65_000, kind: "contribution" }),
      investmentActivity({ date: "2026-06-15", amountMinor: 50_000, kind: "contribution" }),
      investmentActivity({ date: "2026-07-20", amountMinor: 4_200, kind: "dividend" }),
      investmentActivity({ date: "2026-06-20", amountMinor: 3_000, kind: "dividend" }),
      investmentActivity({ date: "2026-05-20", amountMinor: 2_800, kind: "interest" }),
      // Buys spend cash — never counted as contributions or passive income.
      investmentActivity({ date: "2026-07-21", amountMinor: -69_200, kind: "buy" }),
    ],
  });

describe("investment summary", () => {
  it("sums contributions per month and averages trailing passive income", () => {
    const m = computeMetrics(state(), cfg, AS_OF);
    expect(m.investments.contributionsMtd).toEqual(money(70_000));
    expect(m.investments.contributionsCompletedMonth).toEqual(money(65_000));
    expect(m.investments.contributionsPriorMonth).toEqual(money(50_000));
    expect(m.investments.passiveIncomeCompletedMonth).toEqual(money(4_200));
    // Trailing 3 full months: May 2800 + June 3000 + July 4200 = 10000 / 3
    expect(m.investments.passiveIncomeMonthly).toEqual(money(3_333));
  });

  it("passive income is null (not $0) when no activity exists at all", () => {
    const m = computeMetrics(emptyState(), cfg, AS_OF);
    expect(m.investments.passiveIncomeMonthly).toBeNull();
    expect(m.investments.contributionsMtd).toEqual(money(0));
  });
});

describe("investment events on month roll", () => {
  const withMonths = () => {
    const s = state();
    return {
      ...s,
      // Give the months transaction activity so the roll trigger fires.
    };
  };

  it("emits CONTRIBUTION_MADE + INCREASED + PASSIVE_INCOME_INCREASED exactly once", () => {
    const input = withMonths();
    const july = computeMetrics(input, cfg, isoDate("2026-07-31"));
    const august = computeMetrics(input, cfg, isoDate("2026-08-01"));
    const events = deriveEvents(july, august, cfg);
    const types = events.map((e) => e.type);

    expect(types).toContain("RETIREMENT_CONTRIBUTION_MADE");
    expect(types).toContain("RETIREMENT_CONTRIBUTION_INCREASED"); // 500 -> 650, +30%
    expect(types).toContain("PASSIVE_INCOME_INCREASED"); // 30 -> 42, +40%

    const made = events.find((e) => e.type === "RETIREMENT_CONTRIBUTION_MADE");
    if (made?.type === "RETIREMENT_CONTRIBUTION_MADE") {
      expect(made.month).toBe("2026-07");
      expect(made.amount).toEqual(money(65_000));
    }

    // Same month, no roll: silence (idempotent).
    const august2 = computeMetrics(input, cfg, isoDate("2026-08-02"));
    expect(deriveEvents(august, august2, cfg)).toEqual([]);
  });

  it("survives a previous snapshot persisted before the investments field existed", () => {
    const input = withMonths();
    const july = computeMetrics(input, cfg, isoDate("2026-07-31"));
    const august = computeMetrics(input, cfg, isoDate("2026-08-01"));
    const { investments: _dropped, ...legacyPrev } = july;
    expect(() => deriveEvents(legacyPrev as unknown as typeof july, august, cfg)).not.toThrow();
  });
});
