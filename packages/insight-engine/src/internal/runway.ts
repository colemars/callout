import type { Account, ISOMonth, Transaction } from "@platform/financial-core";
import { addDays, isoMonth, monthOf, startOfMonth, sumOf } from "@platform/financial-core";
import type { ISODate } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import { summarizeMonth } from "./spending.js";

/** The N full calendar months strictly before asOf's month, oldest first. */
export function lastFullMonths(asOf: ISODate, n: number): ISOMonth[] {
  const months: ISOMonth[] = [];
  let cursor = startOfMonth(monthOf(asOf));
  for (let i = 0; i < n; i++) {
    cursor = startOfMonth(monthOf(addDays(cursor, -1)));
    months.unshift(monthOf(cursor));
  }
  return months.map((m) => isoMonth(m));
}

/**
 * Emergency runway: liquid balance (active depository accounts) divided by the
 * average monthly essential spend over the lookback window. Null when there is
 * no essential spending history to average.
 */
export function computeRunwayMonths(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: ISODate,
  config: EngineConfig,
): number | null {
  const liquid = sumOf(
    accounts.filter((a) => a.isActive && a.kind === "depository").map((a) => a.balance),
    config.currency,
  );

  const months = lastFullMonths(asOf, config.runwayLookbackMonths);
  let essentialTotal = 0;
  for (const month of months) {
    const summary = summarizeMonth(transactions, month, config);
    for (const s of summary.spendingByCategory) {
      if (config.essentialCategories.includes(s.category)) {
        essentialTotal += s.amount.amountMinor;
      }
    }
  }
  if (essentialTotal <= 0) return null;

  const avgMonthly = essentialTotal / config.runwayLookbackMonths;
  if (liquid.amountMinor <= 0) return 0;
  return Math.round((liquid.amountMinor / avgMonthly) * 10) / 10;
}
