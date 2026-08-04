import type { Category, FinancialEvent, Money } from "@platform/financial-core";
import { abs, isNegative, isPositive, money, subtract } from "@platform/financial-core";
import type { EngineConfig } from "./config.js";
import type { MetricSet, MonthSummary } from "./metrics.js";

/**
 * Diffs two metric snapshots into normalized events. Edge-triggered by design:
 * deriveEvents(m, m) is always []. With previous === null only goal baselines
 * are announced — there is nothing to compare yet.
 */
export function deriveEvents(
  previous: MetricSet | null,
  current: MetricSet,
  config: EngineConfig,
): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  const base = { userId: current.userId, occurredOn: current.asOf } as const;

  // Goals: announce on first evaluation, then only on on/off-track flips.
  for (const g of current.goalStatuses) {
    if (!g.evaluable || g.onTrack === null || g.expected === null || g.actual === null) continue;
    const prev = previous?.goalStatuses.find((p) => p.goalId === g.goalId);
    // g.onTrack is non-null here, so an equal prev.onTrack means "already announced".
    if (prev?.evaluable && prev.onTrack === g.onTrack) continue;
    if (g.onTrack) {
      events.push({
        ...base,
        type: "GOAL_ON_TRACK",
        goalId: g.goalId,
        surplus: abs(subtract(g.actual, g.expected)),
      });
    } else {
      events.push({
        ...base,
        type: "GOAL_OFF_TRACK",
        goalId: g.goalId,
        expected: g.expected,
        actual: g.actual,
        shortfall: abs(subtract(g.expected, g.actual)),
      });
    }
  }

  if (previous !== null) {
    // Month completion: when the snapshot month rolls over, judge the month
    // that just finished (current.completedMonth) exactly once.
    if (previous.month !== current.month && current.completedMonth.transactionCount > 0) {
      const done = current.completedMonth;
      if (isNegative(done.netCashFlow)) {
        events.push({
          ...base,
          type: "NET_CASH_FLOW_NEGATIVE",
          month: done.month,
          netFlow: done.netCashFlow,
        });
      } else if (isPositive(done.netCashFlow)) {
        events.push({
          ...base,
          type: "NET_CASH_FLOW_POSITIVE",
          month: done.month,
          netFlow: done.netCashFlow,
        });
      }
      if (current.priorMonth.transactionCount > 0) {
        events.push(...spendingDeltas(current, done, current.priorMonth, config, base));
      }
    }

    // Recurring merchants: set difference between snapshots.
    const prevMerchants = new Set(previous.recurringCandidates.map((c) => c.merchant));
    const currMerchants = new Set(current.recurringCandidates.map((c) => c.merchant));
    for (const c of current.recurringCandidates) {
      if (!prevMerchants.has(c.merchant)) {
        events.push({
          ...base,
          type: "RECURRING_EXPENSE_ADDED",
          merchant: c.merchant,
          estimatedMonthly: c.averageAmount,
        });
      }
    }
    for (const c of previous.recurringCandidates) {
      if (!currMerchants.has(c.merchant)) {
        events.push({
          ...base,
          type: "RECURRING_EXPENSE_REMOVED",
          merchant: c.merchant,
          lastSeen: c.lastSeen,
        });
      }
    }

    // High-interest debt: threshold-gated change between snapshots.
    const debtDelta = subtract(current.totalHighInterestDebt, previous.totalHighInterestDebt);
    if (Math.abs(debtDelta.amountMinor) >= config.debtDeltaThresholdMinor) {
      events.push({
        ...base,
        type:
          debtDelta.amountMinor > 0
            ? "HIGH_INTEREST_DEBT_INCREASED"
            : "HIGH_INTEREST_DEBT_DECREASED",
        previous: previous.totalHighInterestDebt,
        current: current.totalHighInterestDebt,
        delta: abs(debtDelta),
      });
    }

    // Emergency runway: threshold-gated change.
    if (
      previous.emergencyRunwayMonths !== null &&
      current.emergencyRunwayMonths !== null &&
      Math.abs(current.emergencyRunwayMonths - previous.emergencyRunwayMonths) >=
        config.runwayChangeThresholdMonths
    ) {
      events.push({
        ...base,
        type: "EMERGENCY_RUNWAY_CHANGED",
        previousMonths: previous.emergencyRunwayMonths,
        currentMonths: current.emergencyRunwayMonths,
      });
    }
  }

  // Note: PASSIVE_INCOME_INCREASED is part of the vocabulary but not yet
  // derivable — the data model has no passive-income classification.

  return events.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function spendingDeltas(
  current: MetricSet,
  done: MonthSummary,
  baseline: MonthSummary,
  config: EngineConfig,
  base: { userId: MetricSet["userId"]; occurredOn: MetricSet["asOf"] },
): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  const doneBy = new Map(done.spendingByCategory.map((s) => [s.category, s.amount]));
  const baseBy = new Map(baseline.spendingByCategory.map((s) => [s.category, s.amount]));

  const compareOne = (category: Category | "total", prev: Money, curr: Money): void => {
    if (prev.amountMinor === 0) return; // no baseline to compare against
    const deltaMinor = curr.amountMinor - prev.amountMinor;
    const deltaPct = Math.round((deltaMinor / prev.amountMinor) * 1000) / 10;
    if (
      Math.abs(deltaMinor) < config.spendingDeltaThresholdMinor ||
      Math.abs(deltaPct) < config.spendingDeltaThresholdPct
    ) {
      return;
    }
    events.push({
      ...base,
      type: deltaMinor > 0 ? "MONTHLY_SPENDING_INCREASED" : "MONTHLY_SPENDING_DECREASED",
      category,
      month: done.month,
      previous: prev,
      current: curr,
      deltaPct: Math.abs(deltaPct),
    });
  };

  compareOne("total", baseline.totalSpending, done.totalSpending);
  const categories = [...new Set([...doneBy.keys(), ...baseBy.keys()])].sort();
  for (const category of categories) {
    compareOne(
      category,
      baseBy.get(category) ?? money(0, config.currency),
      doneBy.get(category) ?? money(0, config.currency),
    );
  }
  return events;
}

function sortKey(e: FinancialEvent): string {
  switch (e.type) {
    case "GOAL_OFF_TRACK":
    case "GOAL_ON_TRACK":
      return `1:${e.goalId}:${e.type}`;
    case "NET_CASH_FLOW_NEGATIVE":
    case "NET_CASH_FLOW_POSITIVE":
      return `2:${e.month}:${e.type}`;
    case "MONTHLY_SPENDING_INCREASED":
    case "MONTHLY_SPENDING_DECREASED":
      return `3:${e.month}:${e.category}:${e.type}`;
    case "RECURRING_EXPENSE_ADDED":
    case "RECURRING_EXPENSE_REMOVED":
      return `4:${e.merchant}:${e.type}`;
    case "HIGH_INTEREST_DEBT_INCREASED":
    case "HIGH_INTEREST_DEBT_DECREASED":
      return `5:${e.type}`;
    case "PASSIVE_INCOME_INCREASED":
      return `6:${e.type}`;
    case "EMERGENCY_RUNWAY_CHANGED":
      return `7:${e.type}`;
  }
}
