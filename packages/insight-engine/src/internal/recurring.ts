import type { Transaction } from "@platform/financial-core";
import { compareDates, daysBetween, money, multiplyRatio } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { RecurringCandidate } from "../metrics.js";

/**
 * Ported from v_recurring_candidates: merchants appearing >= minHits times at
 * roughly monthly spacing with similar amounts (sample stddev under
 * max(pct-of-average, floor)).
 */
export function detectRecurring(
  transactions: readonly Transaction[],
  config: EngineConfig,
): RecurringCandidate[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.pending || t.amount.amountMinor >= 0 || t.merchant === undefined) continue;
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
    if (gap < config.recurringMinGapDays || gap > config.recurringMaxGapDays) continue;

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
