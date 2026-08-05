import type { Account, Category } from "@platform/financial-core";
import { accountId, goalId, isoDate, money } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import type { MetricSet } from "../src/metrics.js";
import { CARD, USER, account, emptyState, txn } from "./fixtures.js";

const cfg = defaultEngineConfig;

/** Essential spend history: $1,000/month groceries for the trailing window. */
const essentials = (months: readonly string[]) =>
  months.map((m) =>
    txn({ postedAt: `${m}-10`, amountMinor: -100_000, category: "groceries" as Category }),
  );

/** A metric pair differing only in liquid balance (same account set). */
function runwayPair(prevLiquidMinor: number, currLiquidMinor: number): [MetricSet, MetricSet] {
  const history = essentials(["2026-05", "2026-06", "2026-07"]);
  const mk = (liquid: number) =>
    computeMetrics(
      emptyState({
        accounts: [account({ balance: money(liquid) })],
        transactions: history,
      }),
      cfg,
      isoDate("2026-08-15"),
    );
  return [mk(prevLiquidMinor), mk(currLiquidMinor)];
}

describe("EMERGENCY_FUND_MILESTONE", () => {
  it("emits the crossed tier on an upward crossing", () => {
    const [prev, curr] = runwayPair(250_000, 320_000); // 2.5 -> 3.2 months
    const tiers = deriveEvents(prev, curr, cfg)
      .filter((e) => e.type === "EMERGENCY_FUND_MILESTONE")
      .map((e) => (e.type === "EMERGENCY_FUND_MILESTONE" ? e.tier : 0));
    expect(tiers).toEqual([3]);
  });

  it("a multi-tier jump emits every tier crossed", () => {
    const [prev, curr] = runwayPair(50_000, 700_000); // 0.5 -> 7 months
    const tiers = deriveEvents(prev, curr, cfg)
      .filter((e) => e.type === "EMERGENCY_FUND_MILESTONE")
      .map((e) => (e.type === "EMERGENCY_FUND_MILESTONE" ? e.tier : 0))
      .sort((a, b) => a - b);
    expect(tiers).toEqual([1, 3, 6]);
  });

  it("stays silent without a crossing, downward, and with previous === null", () => {
    const [prev, curr] = runwayPair(320_000, 350_000); // 3.2 -> 3.5, no tier
    expect(
      deriveEvents(prev, curr, cfg).filter((e) => e.type === "EMERGENCY_FUND_MILESTONE"),
    ).toEqual([]);
    const [high, low] = runwayPair(700_000, 250_000); // downward
    expect(
      deriveEvents(high, low, cfg).filter((e) => e.type === "EMERGENCY_FUND_MILESTONE"),
    ).toEqual([]);
    expect(deriveEvents(null, curr, cfg)).toEqual([]);
  });
});

describe("account-composition guard", () => {
  const debtHistory = essentials(["2026-05", "2026-06", "2026-07"]);
  const withCard = emptyState({
    accounts: [
      account({ balance: money(300_000) }),
      account({ id: CARD, kind: "credit", balance: money(500_000), name: "Card" }),
    ],
    transactions: debtHistory,
  });
  const cardUnlinked = emptyState({
    accounts: [account({ balance: money(300_000) })],
    transactions: debtHistory,
  });

  it("unlinking the last card never fires a phantom DEBT_ELIMINATED", () => {
    const prev = computeMetrics(withCard, cfg, isoDate("2026-08-15"));
    const curr = computeMetrics(cardUnlinked, cfg, isoDate("2026-08-15"));
    const events = deriveEvents(prev, curr, cfg);
    expect(events.filter((e) => e.type === "DEBT_ELIMINATED")).toEqual([]);
    // The delta still reports, but flagged so folds can ignore it.
    const delta = events.find((e) => e.type === "HIGH_INTEREST_DEBT_DECREASED");
    expect(delta).toBeDefined();
    expect(delta?.type === "HIGH_INTEREST_DEBT_DECREASED" && delta.accountSetChanged).toBe(true);
  });

  it("paying the debt to zero over an unchanged set DOES fire DEBT_ELIMINATED", () => {
    const paidOff = emptyState({
      accounts: [
        account({ balance: money(300_000) }),
        account({ id: CARD, kind: "credit", balance: money(0), name: "Card" }),
      ],
      transactions: debtHistory,
    });
    const prev = computeMetrics(withCard, cfg, isoDate("2026-08-15"));
    const curr = computeMetrics(paidOff, cfg, isoDate("2026-08-15"));
    const events = deriveEvents(prev, curr, cfg);
    const gone = events.find((e) => e.type === "DEBT_ELIMINATED");
    expect(gone?.type === "DEBT_ELIMINATED" && gone.previous.amountMinor).toBe(500_000);
    const delta = events.find((e) => e.type === "HIGH_INTEREST_DEBT_DECREASED");
    expect(delta?.type === "HIGH_INTEREST_DEBT_DECREASED" && delta.accountSetChanged).toBe(
      undefined,
    );
  });

  it("linking a savings account suppresses runway milestones", () => {
    const before = computeMetrics(
      emptyState({ accounts: [account({ balance: money(250_000) })], transactions: debtHistory }),
      cfg,
      isoDate("2026-08-15"),
    );
    const savings: Account = account({
      id: accountId("acct-savings"),
      name: "Savings",
      balance: money(500_000),
    });
    const after = computeMetrics(
      emptyState({
        accounts: [account({ balance: money(250_000) }), savings],
        transactions: debtHistory,
      }),
      cfg,
      isoDate("2026-08-15"),
    );
    expect(
      deriveEvents(before, after, cfg).filter((e) => e.type === "EMERGENCY_FUND_MILESTONE"),
    ).toEqual([]);
  });
});

describe("SAVINGS_RATE_MILESTONE", () => {
  /** May–July: fixed income, varying spend -> controllable trailing rate. */
  const rateState = (spendMinor: number) =>
    emptyState({
      transactions: ["2026-05", "2026-06", "2026-07"].flatMap((m) => [
        txn({ postedAt: `${m}-01`, amountMinor: 500_000, category: "income" as Category }),
        txn({ postedAt: `${m}-10`, amountMinor: -spendMinor, category: "dining" as Category }),
      ]),
    });

  it("fires crossed tiers on the month roll", () => {
    // July 31 (month 2026-07) vs Aug 1 (month 2026-08): the roll. Rate moves
    // via the trailing window: 4% before, 22% after.
    const prev = computeMetrics(rateState(480_000), cfg, isoDate("2026-07-31"));
    const curr = computeMetrics(rateState(390_000), cfg, isoDate("2026-08-01"));
    expect(prev.savingsRate.pct).toBe(4);
    expect(curr.savingsRate.pct).toBe(22);
    const tiers = deriveEvents(prev, curr, cfg)
      .filter((e) => e.type === "SAVINGS_RATE_MILESTONE")
      .map((e) => (e.type === "SAVINGS_RATE_MILESTONE" ? e.tierPct : 0))
      .sort((a, b) => a - b);
    expect(tiers).toEqual([5, 10, 20]);
  });

  it("never fires mid-month, even across a tier", () => {
    const prev = computeMetrics(rateState(480_000), cfg, isoDate("2026-08-01"));
    const curr = computeMetrics(rateState(390_000), cfg, isoDate("2026-08-02"));
    expect(
      deriveEvents(prev, curr, cfg).filter((e) => e.type === "SAVINGS_RATE_MILESTONE"),
    ).toEqual([]);
  });
});

describe("UNDER_BUDGET_STREAK", () => {
  const decree = (createdAt: string) => ({
    userId: USER,
    category: "dining" as Category,
    monthlyCap: money(50_000),
    active: true,
    createdAt: isoDate(createdAt),
  });
  const monthlyDining = (months: readonly string[], amountMinor: number) =>
    months.map((m) =>
      txn({ postedAt: `${m}-12`, amountMinor: -amountMinor, category: "dining" as Category }),
    );

  it("counts only months after issuance and announces from 2 on the roll", () => {
    const state = emptyState({
      budgets: [decree("2026-05-10")],
      // April–July all under cap, but April/May predate/share the issuance month.
      transactions: monthlyDining(["2026-04", "2026-05", "2026-06", "2026-07"], 30_000),
    });
    const july = computeMetrics(state, cfg, isoDate("2026-07-31"));
    const aug = computeMetrics(state, cfg, isoDate("2026-08-01"));
    expect(aug.underBudgetStreak.months).toBe(2); // June + July only
    const streaks = deriveEvents(july, aug, cfg).filter((e) => e.type === "UNDER_BUDGET_STREAK");
    expect(streaks).toHaveLength(1);
    expect(streaks[0]?.type === "UNDER_BUDGET_STREAK" && streaks[0].months).toBe(2);
  });

  it("a month with no data at all ends the streak walk — no data is not discipline", () => {
    const gappy = emptyState({
      budgets: [decree("2026-03-01")],
      // April is a data gap; May–July held. The walk stops at the gap.
      transactions: monthlyDining(["2026-05", "2026-06", "2026-07"], 30_000),
    });
    expect(computeMetrics(gappy, cfg, isoDate("2026-08-01")).underBudgetStreak.months).toBe(3);
    const allGap = emptyState({ budgets: [decree("2026-03-01")], transactions: [] });
    expect(computeMetrics(allGap, cfg, isoDate("2026-08-01")).underBudgetStreak.months).toBe(0);
  });

  it("a breached month breaks the streak; one held month stays silent", () => {
    const breached = emptyState({
      budgets: [decree("2026-04-01")],
      transactions: [
        ...monthlyDining(["2026-05", "2026-07"], 30_000),
        ...monthlyDining(["2026-06"], 90_000), // breach
      ],
    });
    const m = computeMetrics(breached, cfg, isoDate("2026-08-01"));
    expect(m.underBudgetStreak.months).toBe(1); // July only
    const prev = computeMetrics(breached, cfg, isoDate("2026-07-31"));
    expect(deriveEvents(prev, m, cfg).filter((e) => e.type === "UNDER_BUDGET_STREAK")).toEqual([]);
  });
});

describe("GOAL_COMPLETED", () => {
  const paydownGoal = (balanceMinor: number) =>
    emptyState({
      accounts: [account({ id: CARD, kind: "credit", balance: money(balanceMinor), name: "Card" })],
      goals: [
        {
          kind: "debt_paydown" as const,
          id: goalId("goal-paydown"),
          userId: USER,
          accountId: CARD,
          targetAmount: money(0),
          targetDate: isoDate("2026-12-31"),
          startedAt: isoDate("2026-06-01"),
          baselineAmount: money(400_000),
          active: true,
        },
      ],
    });

  it("fires once on the edge, then stays silent", () => {
    const owing = computeMetrics(paydownGoal(100_000), cfg, isoDate("2026-08-14"));
    const paid = computeMetrics(paydownGoal(0), cfg, isoDate("2026-08-15"));
    const events = deriveEvents(owing, paid, cfg);
    const done = events.filter((e) => e.type === "GOAL_COMPLETED");
    expect(done).toHaveLength(1);
    expect(done[0]?.type === "GOAL_COMPLETED" && done[0].goalId).toBe("goal-paydown");
    // A completed goal announces nothing else about its pacing.
    expect(events.filter((e) => e.type === "GOAL_ON_TRACK")).toEqual([]);
    // Already-completed -> no re-announcement.
    expect(deriveEvents(paid, paid, cfg)).toEqual([]);
  });

  it("a goal already complete at its first evaluation fires (and can then retire)", () => {
    // The previous snapshot exists but has never seen this goal.
    const before = computeMetrics(emptyState(), cfg, isoDate("2026-08-14"));
    const paid = computeMetrics(paydownGoal(0), cfg, isoDate("2026-08-15"));
    const done = deriveEvents(before, paid, cfg).filter((e) => e.type === "GOAL_COMPLETED");
    expect(done).toHaveLength(1);
  });
});

describe("new fields keep the core property", () => {
  it("deriveEvents(m, m) === [] with milestones, streaks, and fingerprints in play", () => {
    const state = emptyState({
      accounts: [
        account({ balance: money(700_000) }),
        account({ id: CARD, kind: "credit", balance: money(50_000), name: "Card" }),
      ],
      budgets: [
        {
          userId: USER,
          category: "dining" as Category,
          monthlyCap: money(50_000),
          active: true,
          createdAt: isoDate("2026-05-01"),
        },
      ],
      transactions: [
        ...essentials(["2026-05", "2026-06", "2026-07"]),
        txn({ postedAt: "2026-06-05", amountMinor: 500_000, category: "income" as Category }),
        txn({ postedAt: "2026-07-05", amountMinor: 500_000, category: "income" as Category }),
      ],
    });
    const m = computeMetrics(state, cfg, isoDate("2026-08-15"));
    expect(deriveEvents(m, m, cfg)).toEqual([]);
  });
});
