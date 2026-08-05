import { isoDate } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import { detectRecurring, detectRecurringIncome } from "../src/internal/recurring.js";
import { emptyState, txn } from "./fixtures.js";

const cfg = defaultEngineConfig;

/** Biweekly payroll: same employer, same amount, every 14 days. */
const payroll = (dates: readonly string[]) =>
  dates.map((d) =>
    txn({ postedAt: d, amountMinor: 240_000, merchant: "ACME PAYROLL", category: "income" }),
  );

describe("detectRecurringIncome", () => {
  it("detects biweekly payroll — the cadence the expense window excludes", () => {
    const txns = payroll(["2026-06-05", "2026-06-19", "2026-07-03", "2026-07-17", "2026-07-31"]);
    const income = detectRecurringIncome(txns, cfg);
    expect(income).toHaveLength(1);
    expect(income[0]?.merchant).toBe("ACME PAYROLL");
    expect(income[0]?.averageGapDays).toBe(14);
    expect(income[0]?.averageAmount.amountMinor).toBe(240_000);
    // The expense detector must NOT see it (positive amounts, and biweekly).
    expect(detectRecurring(txns, cfg)).toEqual([]);
  });

  it("only categorized income counts — recurring refunds do not become payroll", () => {
    const refunds = ["2026-06-05", "2026-07-05", "2026-08-01"].map((d) =>
      txn({ postedAt: d, amountMinor: 50_00, merchant: "AMAZON REFUND", category: "shopping" }),
    );
    expect(detectRecurringIncome(refunds, cfg)).toEqual([]);
  });

  it("keeps the same amount-stability discipline as expenses", () => {
    const wobbly = [
      txn({ postedAt: "2026-06-05", amountMinor: 100_000, merchant: "GIGS", category: "income" }),
      txn({ postedAt: "2026-06-19", amountMinor: 220_000, merchant: "GIGS", category: "income" }),
      txn({ postedAt: "2026-07-03", amountMinor: 40_000, merchant: "GIGS", category: "income" }),
    ];
    expect(detectRecurringIncome(wobbly, cfg)).toEqual([]);
  });

  it("expense detection is unchanged by the refactor", () => {
    const subs = ["2026-05-10", "2026-06-10", "2026-07-10"].map((d) =>
      txn({ postedAt: d, amountMinor: -17_99, merchant: "NETFLIX", category: "subscriptions" }),
    );
    const out = detectRecurring(subs, cfg);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      merchant: "NETFLIX",
      hits: 3,
      firstSeen: "2026-05-10",
      lastSeen: "2026-07-10",
      averageGapDays: 30.5,
    });
  });

  it("income candidates never leak into the event ledger", () => {
    // Payroll appears between two snapshots: incomeCandidates changes, but
    // RECURRING_EXPENSE_ADDED/REMOVED must stay expense-scoped.
    const before = computeMetrics(emptyState(), cfg, isoDate("2026-08-01"));
    const after = computeMetrics(
      emptyState({
        transactions: payroll(["2026-06-05", "2026-06-19", "2026-07-03", "2026-07-17"]),
      }),
      cfg,
      isoDate("2026-08-01"),
    );
    expect(after.incomeCandidates).toHaveLength(1);
    const types = deriveEvents(before, after, cfg).map((e) => e.type);
    expect(types).not.toContain("RECURRING_EXPENSE_ADDED");
    expect(types).not.toContain("RECURRING_EXPENSE_REMOVED");
    // And the disappearance leaks nothing either.
    const goneTypes = deriveEvents(after, before, cfg).map((e) => e.type);
    expect(goneTypes).not.toContain("RECURRING_EXPENSE_REMOVED");
  });
});
