import type { Transaction } from "@platform/financial-core";
import { compareDates, daysBetween, money, multiplyRatio } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { RecurringCandidate } from "../metrics.js";

/**
 * Core recurrence detection, parameterized by flow direction and gap window:
 * merchants appearing >= minHits times at roughly regular spacing with
 * similar amounts (sample stddev under max(pct-of-average, floor)).
 */
function detect(
  transactions: readonly Transaction[],
  config: EngineConfig,
  keep: (t: Transaction) => boolean,
  minGapDays: number,
  maxGapDays: number,
): RecurringCandidate[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.pending || t.merchant === undefined || !keep(t)) continue;
    const list = byMerchant.get(t.merchant);
    if (list) {
      list.push(t);
    } else {
      byMerchant.set(t.merchant, [t]);
    }
  }

  const candidates: RecurringCandidate[] = [];
  for (const [merchant, txns] of byMerchant) {
    const hits = txns.length;
    if (hits < config.recurringMinHits) continue;

    const amounts = txns.map((t) => Math.abs(t.amount.amountMinor));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const mean = sum / hits;
    const variance = amounts.reduce((a, x) => a + (x - mean) ** 2, 0) / (hits - 1);
    const stddev = Math.sqrt(variance);
    if (
      stddev >= Math.max(mean * config.recurringStddevPctOfAvg, config.recurringStddevFloorMinor)
    ) {
      continue;
    }

    const dates = txns.map((t) => t.postedAt).sort(compareDates);
    const firstSeen = dates[0];
    const lastSeen = dates[dates.length - 1];
    if (firstSeen === undefined || lastSeen === undefined) continue;
    const gap = daysBetween(firstSeen, lastSeen) / (hits - 1);
    if (gap < minGapDays || gap > maxGapDays) continue;

    candidates.push({
      merchant,
      hits,
      averageAmount: multiplyRatio(money(sum, config.currency), 1, hits),
      firstSeen,
      lastSeen,
      averageGapDays: Math.round(gap * 10) / 10,
    });
  }

  return candidates.sort((a, b) => a.merchant.localeCompare(b.merchant));
}

/**
 * Ported from v_recurring_candidates: recurring EXPENSES at roughly monthly
 * spacing. This feeds RECURRING_EXPENSE_ADDED/REMOVED event derivation —
 * its behavior must not drift.
 */
export function detectRecurring(
  transactions: readonly Transaction[],
  config: EngineConfig,
): RecurringCandidate[] {
  return detect(
    transactions,
    config,
    (t) => t.amount.amountMinor < 0,
    config.recurringMinGapDays,
    config.recurringMaxGapDays,
  );
}

/**
 * Recurring INCOME (payroll, regular deposits): inflows only, with a wider
 * gap window whose floor admits biweekly pay. Display-only — this feeds no
 * event derivation; the ledger's recurring events stay expense-scoped.
 */
export function detectRecurringIncome(
  transactions: readonly Transaction[],
  config: EngineConfig,
): RecurringCandidate[] {
  return detect(
    transactions,
    config,
    (t) => t.amount.amountMinor > 0 && t.category === "income",
    config.recurringIncomeMinGapDays,
    config.recurringIncomeMaxGapDays,
  );
}
