import { isoDate, money } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import type { FinancialState } from "../src/state.js";
import { AS_OF, CARD, account, emptyState, monthlyCharges, savingsGoal, txn } from "./fixtures.js";

const cfg = defaultEngineConfig;

describe("deriveEvents", () => {
  it("deriveEvents(m, m) is always empty", () => {
    const state = emptyState({
      accounts: [account({ balance: money(100_000) })],
      transactions: [
        txn({ postedAt: "2026-08-01", amountMinor: 400_000, category: "income" }),
        txn({ postedAt: "2026-07-15", amountMinor: -90_000, category: "housing" }),
      ],
      goals: [
        savingsGoal({ targetMinor: 100_000, startedAt: "2026-07-01", targetDate: "2026-12-31" }),
      ],
    });
    const m = computeMetrics(state, cfg, AS_OF);
    expect(deriveEvents(m, m, cfg)).toEqual([]);
  });

  it("announces goal state on first evaluation, then only on flips", () => {
    const goal = savingsGoal({
      targetMinor: 300_000,
      startedAt: "2026-08-01",
      targetDate: "2026-08-31",
    });
    const offTrackState = emptyState({
      goals: [goal],
      transactions: [txn({ postedAt: "2026-08-02", amountMinor: 10_000, category: "income" })],
    });
    const current = computeMetrics(offTrackState, cfg, AS_OF);

    // First evaluation: baseline announcement.
    const first = deriveEvents(null, current, cfg);
    expect(first).toHaveLength(1);
    expect(first[0]?.type).toBe("GOAL_OFF_TRACK");
    if (first[0]?.type === "GOAL_OFF_TRACK") {
      expect(first[0].shortfall.amountMinor).toBeGreaterThan(0);
    }

    // Same status next snapshot: silence.
    expect(deriveEvents(current, current, cfg)).toEqual([]);

    // Big income lands -> flips on track -> one event.
    const onTrackState: FinancialState = {
      ...offTrackState,
      transactions: [
        ...offTrackState.transactions,
        txn({ postedAt: "2026-08-14", amountMinor: 200_000, category: "income" }),
      ],
    };
    const next = computeMetrics(onTrackState, cfg, isoDate("2026-08-16"));
    const flipped = deriveEvents(current, next, cfg);
    expect(flipped).toHaveLength(1);
    expect(flipped[0]?.type).toBe("GOAL_ON_TRACK");
  });

  it("judges a completed month exactly once (net cash flow + spending deltas)", () => {
    const transactions = [
      // June (prior baseline): $500 dining spend, positive flow
      txn({ postedAt: "2026-06-10", amountMinor: 300_000, category: "income" }),
      txn({ postedAt: "2026-06-12", amountMinor: -50_000, category: "dining" }),
      // July (the month being judged): dining doubled, flow negative
      txn({ postedAt: "2026-07-05", amountMinor: 100_000, category: "income" }),
      txn({ postedAt: "2026-07-08", amountMinor: -110_000, category: "dining" }),
    ];
    const state = emptyState({ transactions });

    const july31 = computeMetrics(state, cfg, isoDate("2026-07-31"));
    const aug1 = computeMetrics(state, cfg, isoDate("2026-08-01"));

    const events = deriveEvents(july31, aug1, cfg);
    const types = events.map((e) => e.type);
    expect(types).toContain("NET_CASH_FLOW_NEGATIVE");
    expect(types).toContain("MONTHLY_SPENDING_INCREASED");

    const flow = events.find((e) => e.type === "NET_CASH_FLOW_NEGATIVE");
    if (flow?.type === "NET_CASH_FLOW_NEGATIVE") {
      expect(flow.month).toBe("2026-07");
      expect(flow.netFlow).toEqual(money(-10_000));
    }

    const dining = events.find(
      (e) => e.type === "MONTHLY_SPENDING_INCREASED" && e.category === "dining",
    );
    if (dining?.type === "MONTHLY_SPENDING_INCREASED") {
      expect(dining.previous).toEqual(money(50_000));
      expect(dining.current).toEqual(money(110_000));
      expect(dining.deltaPct).toBe(120);
    }

    // Within the same month, no month-completion events fire.
    const aug2 = computeMetrics(state, cfg, isoDate("2026-08-02"));
    expect(deriveEvents(aug1, aug2, cfg)).toEqual([]);
  });

  it("emits recurring added/removed on set changes", () => {
    const withNetflix = emptyState({
      transactions: monthlyCharges(
        "Netflix",
        ["2026-04", "2026-05", "2026-06", "2026-07"],
        "10",
        [15_49],
      ),
    });
    const without = emptyState();

    const prev = computeMetrics(without, cfg, AS_OF);
    const curr = computeMetrics(withNetflix, cfg, AS_OF);

    const added = deriveEvents(prev, curr, cfg);
    expect(added).toHaveLength(1);
    expect(added[0]?.type).toBe("RECURRING_EXPENSE_ADDED");
    if (added[0]?.type === "RECURRING_EXPENSE_ADDED") {
      expect(added[0].merchant).toBe("Netflix");
      expect(added[0].estimatedMonthly).toEqual(money(15_49));
    }

    const removed = deriveEvents(curr, prev, cfg);
    expect(removed[0]?.type).toBe("RECURRING_EXPENSE_REMOVED");
  });

  it("debt and runway events respect thresholds", () => {
    const mkState = (cardBalanceMinor: number, liquidMinor: number): FinancialState =>
      emptyState({
        accounts: [
          account({ balance: money(liquidMinor) }),
          account({ id: CARD, kind: "credit", name: "Card", balance: money(cardBalanceMinor) }),
        ],
        transactions: ["2026-05", "2026-06", "2026-07"].map((m) =>
          txn({ postedAt: `${m}-03`, amountMinor: -100_000, category: "housing" }),
        ),
      });

    const prev = computeMetrics(mkState(100_000, 400_000), cfg, AS_OF);

    // +$50 debt: under the $100 threshold; runway unchanged -> silence
    expect(deriveEvents(prev, computeMetrics(mkState(105_000, 400_000), cfg, AS_OF), cfg)).toEqual(
      [],
    );

    // +$150 debt and liquid halved -> both events
    const curr = computeMetrics(mkState(115_000, 200_000), cfg, AS_OF);
    const events = deriveEvents(prev, curr, cfg);
    const types = events.map((e) => e.type);
    expect(types).toContain("HIGH_INTEREST_DEBT_INCREASED");
    expect(types).toContain("EMERGENCY_RUNWAY_CHANGED");

    const debt = events.find((e) => e.type === "HIGH_INTEREST_DEBT_INCREASED");
    if (debt?.type === "HIGH_INTEREST_DEBT_INCREASED") {
      expect(debt.previous).toEqual(money(100_000));
      expect(debt.current).toEqual(money(115_000));
      expect(debt.delta).toEqual(money(15_000));
    }
  });
});
