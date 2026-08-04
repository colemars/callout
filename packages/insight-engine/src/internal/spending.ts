import type { Category, ISOMonth, Money, Transaction } from "@platform/financial-core";
import { abs, add, monthOf, sumOf, zero } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { CategorySpend, MonthSummary } from "../metrics.js";

/** Posted (non-pending) transactions in the given month. */
export function transactionsInMonth(
  transactions: readonly Transaction[],
  month: ISOMonth,
): Transaction[] {
  return transactions.filter((t) => !t.pending && monthOf(t.postedAt) === month);
}

export function summarizeMonth(
  transactions: readonly Transaction[],
  month: ISOMonth,
  config: EngineConfig,
): MonthSummary {
  const txns = transactionsInMonth(transactions, month);

  const spendByCategory = new Map<Category, Money>();
  for (const t of txns) {
    if (t.amount.amountMinor >= 0) continue; // spending = outflows only
    if (config.nonSpendingCategories.includes(t.category)) continue;
    const prev = spendByCategory.get(t.category) ?? zero(config.currency);
    spendByCategory.set(t.category, add(prev, abs(t.amount)));
  }
  const spendingByCategory: CategorySpend[] = [...spendByCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const netCashFlow = sumOf(
    txns.filter((t) => !config.nonCashFlowCategories.includes(t.category)).map((t) => t.amount),
    config.currency,
  );

  return {
    month,
    transactionCount: txns.length,
    totalSpending: sumOf(
      spendingByCategory.map((s) => s.amount),
      config.currency,
    ),
    spendingByCategory,
    netCashFlow,
  };
}
