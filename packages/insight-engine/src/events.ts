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
    // Completion: strictly edge-triggered against the previous snapshot's
    // status ("!== true" so snapshots persisted before the field existed
    // still fire the transition once). No previous status = no edge.
    if (g.completed && prev !== undefined && prev.completed !== true) {
      events.push({
        ...base,
        type: "GOAL_COMPLETED",
        goalId: g.goalId,
        kind: g.kind,
        target: g.target,
      });
      continue; // a completed goal has no pacing left to announce
    }
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

    // Investments: judged on the same month-roll trigger, once per month.
    // (Runtime-guarded: metric snapshots persisted before this field existed
    // deserialize without it.)
    const inv = current.investments as MetricSet["investments"] | undefined;
    if (previous.month !== current.month && inv !== undefined) {
      if (inv.contributionsCompletedMonth.amountMinor > 0) {
        events.push({
          ...base,
          type: "RETIREMENT_CONTRIBUTION_MADE",
          month: current.completedMonth.month,
          amount: inv.contributionsCompletedMonth,
        });
        const prev = inv.contributionsPriorMonth.amountMinor;
        const curr = inv.contributionsCompletedMonth.amountMinor;
        if (prev > 0 && curr >= prev + 10_00 && curr >= prev * 1.05) {
          events.push({
            ...base,
            type: "RETIREMENT_CONTRIBUTION_INCREASED",
            previousMonth: current.priorMonth.month,
            month: current.completedMonth.month,
            previous: inv.contributionsPriorMonth,
            current: inv.contributionsCompletedMonth,
          });
        }
      }
      const passivePrev = inv.passiveIncomePriorMonth.amountMinor;
      const passiveCurr = inv.passiveIncomeCompletedMonth.amountMinor;
      if (
        passivePrev > 0 &&
        passiveCurr >= passivePrev + 10_00 &&
        passiveCurr >= passivePrev * 1.1
      ) {
        events.push({
          ...base,
          type: "PASSIVE_INCOME_INCREASED",
          previous: inv.passiveIncomePriorMonth,
          current: inv.passiveIncomeCompletedMonth,
        });
      }
    }

    // Uncategorized funds: judged on the month roll — money the categorizer
    // couldn't place must announce itself, not silently skew cash flow.
    // (Runtime-guarded like investments: older snapshots lack the field.)
    const uncat = current.uncategorized as MetricSet["uncategorized"] | undefined;
    if (
      previous.month !== current.month &&
      uncat !== undefined &&
      uncat.completedMonthNet.amountMinor >= config.uncategorizedThresholdMinor
    ) {
      events.push({
        ...base,
        type: "UNCATEGORIZED_FUNDS",
        month: current.completedMonth.month,
        count: uncat.completedMonthCount,
        amount: uncat.completedMonthNet,
      });
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

    // Account-composition guard: when the linked account set differs between
    // snapshots, debt/runway movement may be a link or unlink, not behavior.
    // Delta events get flagged (folds ignore them); milestone events are
    // suppressed outright — a phantom "debt eliminated" from unlinking a card
    // must never chronicle. Runtime-guarded: snapshots persisted before the
    // fingerprint existed compare as changed, which fails safe.
    const prevFingerprint = previous.accountFingerprint as string | undefined;
    const currFingerprint = current.accountFingerprint as string | undefined;
    const setChanged = prevFingerprint !== currFingerprint;
    const flag = setChanged ? ({ accountSetChanged: true } as const) : {};

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
        ...flag,
      });
    }

    // The last of the debt is gone — a milestone, so guarded, not flagged.
    if (
      !setChanged &&
      previous.totalHighInterestDebt.amountMinor > 0 &&
      current.totalHighInterestDebt.amountMinor === 0
    ) {
      events.push({ ...base, type: "DEBT_ELIMINATED", previous: previous.totalHighInterestDebt });
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
        ...flag,
      });
    }

    // Emergency-fund milestones: strictly edge-triggered upward crossings;
    // a jump across several tiers emits every tier crossed.
    if (
      !setChanged &&
      previous.emergencyRunwayMonths !== null &&
      current.emergencyRunwayMonths !== null
    ) {
      for (const tier of config.emergencyFundTiersMonths) {
        if (previous.emergencyRunwayMonths < tier && current.emergencyRunwayMonths >= tier) {
          events.push({ ...base, type: "EMERGENCY_FUND_MILESTONE", tier, month: current.month });
        }
      }
    }

    // Savings-rate milestones: judged only when the month rolls, against the
    // trailing rate. (Runtime-guarded: older snapshots lack the field.)
    const prevRate = (previous.savingsRate as MetricSet["savingsRate"] | undefined)?.pct ?? null;
    const currRate = (current.savingsRate as MetricSet["savingsRate"] | undefined)?.pct ?? null;
    if (!setChanged && previous.month !== current.month && prevRate !== null && currRate !== null) {
      for (const tierPct of config.savingsRateTiersPct) {
        if (prevRate < tierPct && currRate >= tierPct) {
          events.push({
            ...base,
            type: "SAVINGS_RATE_MILESTONE",
            tierPct,
            month: current.completedMonth.month,
          });
        }
      }
    }

    // Under-budget streak: announced on the month roll while it holds.
    // (Runtime-guarded; suppressed across account-set changes — a newly
    // linked account rewrites the spending history being judged.)
    const streak = (current.underBudgetStreak as MetricSet["underBudgetStreak"] | undefined)
      ?.months;
    if (
      !setChanged &&
      previous.month !== current.month &&
      streak !== undefined &&
      streak >= config.underBudgetStreakMinMonths
    ) {
      events.push({
        ...base,
        type: "UNDER_BUDGET_STREAK",
        months: streak,
        month: current.completedMonth.month,
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

/**
 * The event's natural identity within (user, type, occurredOn) — used as the
 * persistence dedup key so concurrent derivation can never double-insert.
 * (Also the display sort key; both want the same discriminators.)
 */
export function eventDedupKey(e: FinancialEvent): string {
  return sortKey(e);
}

function sortKey(e: FinancialEvent): string {
  switch (e.type) {
    case "GOAL_OFF_TRACK":
    case "GOAL_ON_TRACK":
    case "GOAL_COMPLETED":
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
    case "DEBT_ELIMINATED":
      return `5:${e.type}`;
    case "PASSIVE_INCOME_INCREASED":
      return `6:${e.type}`;
    case "RETIREMENT_CONTRIBUTION_MADE":
    case "RETIREMENT_CONTRIBUTION_INCREASED":
      return `6:${e.month}:${e.type}`;
    case "UNCATEGORIZED_FUNDS":
      return `8:${e.month}:${e.type}`;
    case "EMERGENCY_RUNWAY_CHANGED":
      return `7:${e.type}`;
    case "EMERGENCY_FUND_MILESTONE":
      return `9:${e.tier}:${e.type}`;
    case "SAVINGS_RATE_MILESTONE":
      return `9:${e.tierPct}:${e.type}`;
    case "UNDER_BUDGET_STREAK":
      return `9:${e.month}:${e.type}`;
  }
}
