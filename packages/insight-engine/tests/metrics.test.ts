import { goalId, isoDate, money } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import {
  AS_OF,
  CARD,
  USER,
  account,
  budget,
  emptyState,
  monthlyCharges,
  savingsGoal,
  snapshot,
  txn,
} from "./fixtures.js";

const cfg = defaultEngineConfig;

describe("budget status (ported from v_budget_status)", () => {
  it("prorates the cap by elapsed days and flags over-pace", () => {
    // asOf 2026-08-15: 15 of 31 days elapsed. Cap $200 -> prorated 200*15/31 = 96.77
    const state = emptyState({
      budgets: [budget("delivery", 200_00), budget("coffee", 80_00)],
      transactions: [
        txn({ postedAt: "2026-08-05", amountMinor: -120_00, category: "delivery" }),
        txn({ postedAt: "2026-08-10", amountMinor: -5_00, category: "coffee" }),
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);

    const delivery = m.budgetStatus.find((b) => b.category === "delivery");
    expect(delivery).toBeDefined();
    expect(delivery?.proratedCap).toEqual(money(96_77));
    expect(delivery?.spentMtd).toEqual(money(120_00));
    expect(delivery?.overPace).toBe(true);
    expect(delivery?.pctOfMonthlyCap).toBe(60);

    const coffee = m.budgetStatus.find((b) => b.category === "coffee");
    expect(coffee?.overPace).toBe(false);
    expect(coffee?.pctOfMonthlyCap).toBe(6.3);
  });

  it("counts only outflows in the asOf month; refunds and other months excluded", () => {
    const state = emptyState({
      budgets: [budget("shopping", 100_00)],
      transactions: [
        txn({ postedAt: "2026-08-03", amountMinor: -40_00, category: "shopping" }),
        txn({ postedAt: "2026-08-04", amountMinor: 15_00, category: "shopping" }), // refund: not spending
        txn({ postedAt: "2026-07-20", amountMinor: -99_00, category: "shopping" }), // prior month
        txn({ postedAt: "2026-08-05", amountMinor: -33_00, category: "shopping", pending: true }),
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.budgetStatus[0]?.spentMtd).toEqual(money(40_00));
  });
});

describe("recurring detection (ported from v_recurring_candidates)", () => {
  it("detects a monthly merchant with stable amounts", () => {
    const state = emptyState({
      transactions: monthlyCharges(
        "Netflix",
        ["2026-04", "2026-05", "2026-06", "2026-07"],
        "10",
        [15_49, 15_49, 15_49, 15_49],
      ),
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.recurringCandidates).toHaveLength(1);
    const c = m.recurringCandidates[0];
    expect(c?.merchant).toBe("Netflix");
    expect(c?.hits).toBe(4);
    expect(c?.averageAmount).toEqual(money(15_49));
    expect(c?.averageGapDays).toBeGreaterThanOrEqual(30);
    expect(c?.averageGapDays).toBeLessThanOrEqual(31);
  });

  it("rejects merchants with too few hits, wrong spacing, or unstable amounts", () => {
    const state = emptyState({
      transactions: [
        // Only 2 hits
        ...monthlyCharges("TwoTimer", ["2026-06", "2026-07"], "05", [10_00, 10_00]),
        // Weekly spacing (gap ~7d)
        txn({ postedAt: "2026-07-01", amountMinor: -8_00, merchant: "Weekly" }),
        txn({ postedAt: "2026-07-08", amountMinor: -8_00, merchant: "Weekly" }),
        txn({ postedAt: "2026-07-15", amountMinor: -8_00, merchant: "Weekly" }),
        // Monthly but wildly varying amounts (stddev >> 15%)
        ...monthlyCharges(
          "Chaotic",
          ["2026-05", "2026-06", "2026-07"],
          "12",
          [10_00, 90_00, 45_00],
        ),
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.recurringCandidates).toHaveLength(0);
  });
});

describe("debt trajectory (ported from v_debt_trajectory)", () => {
  it("computes 30/60/90-day deltas from snapshots", () => {
    const card = account({ id: CARD, kind: "credit", name: "Card", balance: money(150_000) });
    const state = emptyState({
      accounts: [card, account({ balance: money(500_000) })],
      snapshots: [
        snapshot(CARD, "2026-07-14", 140_000), // ~32d before asOf -> 30d baseline
        snapshot(CARD, "2026-06-10", 180_000), // ~66d -> 60d baseline
        // no snapshot old enough for 90d
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.debtTrajectory).toHaveLength(1);
    const d = m.debtTrajectory[0];
    expect(d?.currentBalance).toEqual(money(150_000));
    expect(d?.delta30d).toEqual(money(10_000)); // debt grew $100
    expect(d?.delta60d).toEqual(money(-30_000)); // down $300 vs 60d ago
    expect(d?.delta90d).toBeNull();
    expect(m.totalHighInterestDebt).toEqual(money(150_000));
  });
});

describe("net cash flow and runway", () => {
  it("net cash flow sums signed amounts excluding internal movements", () => {
    const state = emptyState({
      transactions: [
        txn({ postedAt: "2026-08-01", amountMinor: 500_000, category: "income" }),
        txn({ postedAt: "2026-08-05", amountMinor: -120_000, category: "housing" }),
        txn({ postedAt: "2026-08-06", amountMinor: -80_000, category: "transfer" }), // excluded
        txn({ postedAt: "2026-08-07", amountMinor: -50_000, category: "debt_payment" }), // excluded
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.mtd.netCashFlow).toEqual(money(380_000));
  });

  it("runway = liquid / avg essential spend over the lookback months", () => {
    const essentials = ["2026-05", "2026-06", "2026-07"].flatMap((mo) => [
      txn({ postedAt: `${mo}-02`, amountMinor: -100_000, category: "housing" }),
      txn({ postedAt: `${mo}-10`, amountMinor: -50_000, category: "groceries" }),
      txn({ postedAt: `${mo}-12`, amountMinor: -25_000, category: "entertainment" }), // not essential
    ]);
    const state = emptyState({
      accounts: [account({ balance: money(450_000) })], // $4500 liquid
      transactions: essentials,
    });
    const m = computeMetrics(state, cfg, AS_OF);
    // avg essential = $1500/mo; 4500/1500 = 3.0 months
    expect(m.emergencyRunwayMonths).toBe(3);
  });

  it("runway is null with no essential history", () => {
    expect(
      computeMetrics(emptyState({ accounts: [account({ balance: money(100) })] }), cfg, AS_OF)
        .emergencyRunwayMonths,
    ).toBeNull();
  });
});

describe("goal evaluation", () => {
  it("linear expected progress; savings goal off track", () => {
    // Goal: save $3100 net over 2026-08-01..2026-08-31 (baseline 0).
    // By 08-15 (14/30 of the way): expected = 3100 * 14/30 = 1446.67
    const state = emptyState({
      goals: [
        savingsGoal({ targetMinor: 310_000, startedAt: "2026-08-01", targetDate: "2026-08-31" }),
      ],
      transactions: [
        txn({ postedAt: "2026-08-02", amountMinor: 100_000, category: "income" }),
        txn({ postedAt: "2026-08-09", amountMinor: -20_000, category: "dining" }),
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    const g = m.goalStatuses[0];
    expect(g?.evaluable).toBe(true);
    expect(g?.expected).toEqual(money(144_667));
    expect(g?.actual).toEqual(money(80_000));
    expect(g?.onTrack).toBe(false);
  });

  it("debt paydown goal: lower is better", () => {
    const card = account({ id: CARD, kind: "credit", balance: money(90_000) });
    const state = emptyState({
      accounts: [card],
      goals: [
        {
          kind: "debt_paydown",
          id: goalId("goal-paydown"),
          userId: USER,
          accountId: CARD,
          targetAmount: money(50_000),
          targetDate: isoDate("2026-08-31"),
          startedAt: isoDate("2026-08-01"),
          baselineAmount: money(100_000),
          active: true,
        },
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    const g = m.goalStatuses[0];
    // expected = 1000 + (500-1000)*14/30 = 766.67; actual 900 > expected -> off track
    expect(g?.expected).toEqual(money(76_667));
    expect(g?.onTrack).toBe(false);
  });

  it("goals without a baseline are not evaluable", () => {
    const state = emptyState({
      goals: [
        {
          kind: "savings_net_flow",
          id: goalId("goal-no-baseline"),
          userId: USER,
          targetAmount: money(100_000),
          active: true,
        },
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(m.goalStatuses[0]?.evaluable).toBe(false);
    expect(m.goalStatuses[0]?.onTrack).toBeNull();
  });
});
