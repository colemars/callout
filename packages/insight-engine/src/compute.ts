import type { ISODate } from "@platform/financial-core";
import { monthOf } from "@platform/financial-core";
import type { EngineConfig } from "./config.js";
import { computeBudgetStatus } from "./internal/budget.js";
import { computeDebtTrajectory, totalHighInterestDebt } from "./internal/debt.js";
import { computeGoalStatuses } from "./internal/goals.js";
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
  };
}
