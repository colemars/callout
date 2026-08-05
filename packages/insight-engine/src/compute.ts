import type { ISODate, ISOMonth } from "@platform/financial-core";
import { isoMonth, money, monthOf } from "@platform/financial-core";
import type { EngineConfig } from "./config.js";
import { computeBudgetStatus } from "./internal/budget.js";
import { computeDebtTrajectory, totalHighInterestDebt } from "./internal/debt.js";
import { computeGoalStatuses } from "./internal/goals.js";
import { summarizeInvestments } from "./internal/investments.js";
import { detectRecurring } from "./internal/recurring.js";
import { computeRunwayMonths, lastFullMonths } from "./internal/runway.js";
import { summarizeMonth } from "./internal/spending.js";
import type { MetricSet } from "./metrics.js";
import type { FinancialState } from "./state.js";

/**
 * The engine's single entry point for metrics: a pure, deterministic function
 * of (state, config, asOf). No clocks, no randomness, no IO — same inputs,
 * same MetricSet, always.
 */
export function computeMetrics(
  state: FinancialState,
  config: EngineConfig,
  asOf: ISODate,
): MetricSet {
  const month = monthOf(asOf);
  const months = lastFullMonths(asOf, 2);
  const priorMonth = months[0];
  const completedMonth = months[1];
  if (priorMonth === undefined || completedMonth === undefined) {
    throw new Error("lastFullMonths(asOf, 2) must return two months");
  }

  const mtd = summarizeMonth(state.transactions, month, config);

  return {
    userId: state.userId,
    asOf,
    currency: config.currency,
    month,
    mtd,
    completedMonth: summarizeMonth(state.transactions, completedMonth, config),
    priorMonth: summarizeMonth(state.transactions, priorMonth, config),
    budgetStatus: computeBudgetStatus(state.budgets, mtd, asOf, config),
    debtTrajectory: computeDebtTrajectory(state.accounts, state.snapshots, asOf),
    totalHighInterestDebt: totalHighInterestDebt(state.accounts, config),
    recurringCandidates: detectRecurring(state.transactions, config),
    goalStatuses: computeGoalStatuses(
      state.goals,
      state.accounts,
      state.transactions,
      asOf,
      config,
    ),
    emergencyRunwayMonths: computeRunwayMonths(state.accounts, state.transactions, asOf, config),
    investments: summarizeInvestments(state.investmentActivity, asOf, config),
    uncategorized: summarizeUncategorized(state, completedMonth),
    incomeBaseline: computeIncomeBaseline(state, config, asOf),
    savingsRate: computeSavingsRate(state, config, asOf),
    accountFingerprint: accountFingerprint(state),
    underBudgetStreak: computeUnderBudgetStreak(state, config, completedMonth),
  };
}

/**
 * Trailing savings rate over up to 3 completed months with activity:
 * Σ net cash flow ÷ Σ income (net + spending). Null under 2 informative
 * months or when income is non-positive — a rate needs a real denominator.
 */
function computeSavingsRate(
  state: FinancialState,
  config: EngineConfig,
  asOf: ISODate,
): MetricSet["savingsRate"] {
  let saved = 0;
  let income = 0;
  let counted = 0;
  for (const month of lastFullMonths(asOf, 3)) {
    const summary = summarizeMonth(state.transactions, month, config);
    if (summary.transactionCount === 0) continue;
    saved += summary.netCashFlow.amountMinor;
    income += summary.netCashFlow.amountMinor + summary.totalSpending.amountMinor;
    counted++;
  }
  const pct = counted < 2 || income <= 0 ? null : Math.round((saved / income) * 1000) / 10;
  return { monthsCounted: counted, pct };
}

/**
 * Deterministic fingerprint of the active account set (FNV-1a over sorted
 * ids). Snapshots with differing fingerprints must not be compared for
 * debt/runway milestones — a linked or unlinked account is not behavior.
 */
function accountFingerprint(state: FinancialState): string {
  const joined = state.accounts
    .filter((a) => a.isActive)
    .map((a) => a.id as string)
    .sort()
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Consecutive completed months, ending with the latest completed month, in
 * which every active budget's category spend stayed at or under its cap.
 * Judged against CURRENT caps; only months strictly after the newest budget's
 * creation month count — the streak is earned under watch, never backdated.
 */
function computeUnderBudgetStreak(
  state: FinancialState,
  config: EngineConfig,
  completedMonth: ISOMonth,
): MetricSet["underBudgetStreak"] {
  const active = state.budgets.filter((b) => b.active);
  if (active.length === 0) return { months: 0 };
  // A budget without a creation date can't anchor eligibility — no streak.
  const createdMonths = active.map((b) =>
    b.createdAt === undefined ? null : monthOf(b.createdAt),
  );
  if (createdMonths.includes(null)) return { months: 0 };
  const eligibleAfter = (createdMonths as ISOMonth[]).sort().at(-1) as ISOMonth;

  let months = 0;
  let month = completedMonth;
  const CAP = 24; // enough for any bragging-rights streak; bounds the walk
  while (months < CAP && month > eligibleAfter) {
    const summary = summarizeMonth(state.transactions, month, config);
    // No data is not discipline: a month with no activity at all (sync gap,
    // pre-history) can neither hold nor break a streak — it ends the walk.
    if (summary.transactionCount === 0) break;
    const held = active.every((b) => {
      const spent =
        summary.spendingByCategory.find((s) => s.category === b.category)?.amount.amountMinor ?? 0;
      return spent <= b.monthlyCap.amountMinor;
    });
    if (!held) break;
    months++;
    month = previousMonth(month);
  }
  return { months };
}

/** "2026-08" -> "2026-07" without Date arithmetic. */
function previousMonth(month: ISOMonth): ISOMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return isoMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
}

/**
 * Trailing average monthly income over up to 6 completed months with activity.
 * Income per month ≈ net cash flow + spending (all money in, not just lines
 * tagged 'income'). Null under 2 informative months — an average of one month
 * is not an average.
 */
function computeIncomeBaseline(
  state: FinancialState,
  config: EngineConfig,
  asOf: ISODate,
): MetricSet["incomeBaseline"] {
  const months = lastFullMonths(asOf, 6);
  let total = 0;
  let counted = 0;
  for (const month of months) {
    const summary = summarizeMonth(state.transactions, month, config);
    if (summary.transactionCount === 0) continue;
    total += summary.netCashFlow.amountMinor + summary.totalSpending.amountMinor;
    counted++;
  }
  return {
    monthsCounted: counted,
    averageMonthly: counted < 2 ? null : money(Math.round(total / counted)),
  };
}

/** Net 'other' flow of the completed month — money the categorizer couldn't place. */
function summarizeUncategorized(
  state: FinancialState,
  completedMonth: string,
): MetricSet["uncategorized"] {
  const rows = state.transactions.filter(
    (t) => t.category === "other" && monthOf(t.postedAt) === completedMonth,
  );
  const net = rows.reduce((sum, t) => sum + t.amount.amountMinor, 0);
  return { completedMonthCount: rows.length, completedMonthNet: money(Math.abs(net)) };
}
