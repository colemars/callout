import type { ISODate } from "@platform/financial-core";
import { money, monthOf } from "@platform/financial-core";
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
  };
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
