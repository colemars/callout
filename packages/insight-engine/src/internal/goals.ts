import type { Account, Goal, ISODate, Money, Transaction } from "@platform/financial-core";
import {
  add,
  compare,
  compareDates,
  daysBetween,
  multiplyRatio,
  subtract,
  sumOf,
} from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { GoalStatus } from "../metrics.js";

/**
 * A goal is evaluable when it has a full baseline: startedAt, baselineAmount,
 * and targetDate. Expected progress is linear from (startedAt, baseline) to
 * (targetDate, target); actual is the account balance (balance goals) or the
 * cumulative net cash flow since startedAt (savings goals). Debt goals are on
 * track when actual <= expected; everything else when actual >= expected.
 */
export function computeGoalStatuses(
  goals: readonly Goal[],
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: ISODate,
  config: EngineConfig,
): GoalStatus[] {
  return goals
    .filter((g) => g.active)
    .map((g) => evaluate(g, accounts, transactions, asOf, config))
    .sort((a, b) => a.goalId.localeCompare(b.goalId));
}

function evaluate(
  goal: Goal,
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: ISODate,
  config: EngineConfig,
): GoalStatus {
  const notEvaluable: GoalStatus = {
    goalId: goal.id,
    kind: goal.kind,
    evaluable: false,
    onTrack: null,
    expected: null,
    actual: null,
  };

  const { startedAt, baselineAmount, targetDate } = goal;
  if (startedAt === undefined || baselineAmount === undefined || targetDate === undefined) {
    return notEvaluable;
  }
  const totalDays = daysBetween(startedAt, targetDate);
  if (totalDays <= 0 || compareDates(asOf, startedAt) === -1) {
    return notEvaluable;
  }

  const actual = actualValue(goal, accounts, transactions, asOf, config);
  if (actual === null) return notEvaluable;

  const elapsed = Math.min(daysBetween(startedAt, asOf), totalDays);
  const expected = add(
    baselineAmount,
    multiplyRatio(subtract(goal.targetAmount, baselineAmount), elapsed, totalDays),
  );

  const cmp = compare(actual, expected);
  const onTrack = goal.kind === "debt_paydown" ? cmp !== 1 : cmp !== -1;

  return { goalId: goal.id, kind: goal.kind, evaluable: true, onTrack, expected, actual };
}

function actualValue(
  goal: Goal,
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: ISODate,
  config: EngineConfig,
): Money | null {
  switch (goal.kind) {
    case "balance_target":
    case "debt_paydown": {
      const account = accounts.find((a) => a.id === goal.accountId);
      return account?.balance ?? null;
    }
    case "savings_net_flow": {
      const startedAt = goal.startedAt;
      if (startedAt === undefined) return null;
      return sumOf(
        transactions
          .filter(
            (t) =>
              !t.pending &&
              compareDates(t.postedAt, startedAt) !== -1 &&
              compareDates(t.postedAt, asOf) !== 1 &&
              !config.nonCashFlowCategories.includes(t.category),
          )
          .map((t) => t.amount),
        config.currency,
      );
    }
  }
}
