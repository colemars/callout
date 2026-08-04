import type { Budget, ISODate, Money } from "@platform/financial-core";
import {
  compare,
  dayOfMonth,
  daysInMonth,
  monthOf,
  multiplyRatio,
  zero,
} from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { BudgetStatus, MonthSummary } from "../metrics.js";

/**
 * Ported from v_budget_status: month-to-date spend per budgeted category vs a
 * cap prorated by elapsed days. (The SQL rounded half-up; we use the platform
 * default half-even — at most a half-cent apart on exact ties.)
 */
export function computeBudgetStatus(
  budgets: readonly Budget[],
  mtd: MonthSummary,
  asOf: ISODate,
  config: EngineConfig,
): BudgetStatus[] {
  const month = monthOf(asOf);
  const elapsed = dayOfMonth(asOf);
  const total = daysInMonth(month);

  return budgets
    .filter((b) => b.active)
    .map((b) => {
      const spentMtd: Money =
        mtd.spendingByCategory.find((s) => s.category === b.category)?.amount ??
        zero(config.currency);
      const proratedCap = multiplyRatio(b.monthlyCap, elapsed, total);
      const pctOfMonthlyCap =
        b.monthlyCap.amountMinor === 0
          ? 0
          : Math.round((spentMtd.amountMinor / b.monthlyCap.amountMinor) * 1000) / 10;
      return {
        category: b.category,
        monthlyCap: b.monthlyCap,
        spentMtd,
        proratedCap,
        pctOfMonthlyCap,
        overPace: compare(spentMtd, proratedCap) === 1,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}
