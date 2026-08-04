import type { GoalId, ISODate, Money } from "@platform/financial-core";
import { addDays, daysBetween, money } from "@platform/financial-core";
import type { EngineConfig } from "./config.js";
import { computeGoalStatuses } from "./internal/goals.js";
import type { FinancialState } from "./state.js";

export interface GoalProjection {
  readonly goalId: GoalId;
  readonly onTrack: boolean;
  /** Value the current pace lands on at targetDate (null when no targetDate). */
  readonly projectedAtTargetDate: Money | null;
  /** Date the current pace reaches the target (null when pace points away). */
  readonly projectedCompletionDate: ISODate | null;
}

/**
 * Straight-line goal projections from the evaluation baseline: pace is
 * (actual - baseline) / elapsed days, extended forward. Deterministic in
 * (state, config, asOf), like everything else here.
 */
export function project(
  state: FinancialState,
  config: EngineConfig,
  asOf: ISODate,
): GoalProjection[] {
  const statuses = computeGoalStatuses(
    state.goals,
    state.accounts,
    state.transactions,
    asOf,
    config,
  );
  const projections: GoalProjection[] = [];

  for (const status of statuses) {
    if (!status.evaluable || status.actual === null || status.onTrack === null) continue;
    const goal = state.goals.find((g) => g.id === status.goalId);
    if (
      goal === undefined ||
      goal.startedAt === undefined ||
      goal.baselineAmount === undefined ||
      goal.targetDate === undefined
    ) {
      continue;
    }

    const elapsed = daysBetween(goal.startedAt, asOf);
    if (elapsed <= 0) continue;
    const pacePerDay = (status.actual.amountMinor - goal.baselineAmount.amountMinor) / elapsed;

    const remainingToTarget = goal.targetAmount.amountMinor - status.actual.amountMinor;
    let projectedCompletionDate: ISODate | null = null;
    if (remainingToTarget === 0) {
      projectedCompletionDate = asOf;
    } else if (pacePerDay !== 0 && Math.sign(remainingToTarget) === Math.sign(pacePerDay)) {
      projectedCompletionDate = addDays(asOf, Math.ceil(remainingToTarget / pacePerDay));
    }

    const daysToTarget = daysBetween(asOf, goal.targetDate);
    const projectedAtTargetDate =
      daysToTarget >= 0
        ? money(Math.round(status.actual.amountMinor + pacePerDay * daysToTarget), config.currency)
        : null;

    projections.push({
      goalId: status.goalId,
      onTrack: status.onTrack,
      projectedAtTargetDate,
      projectedCompletionDate,
    });
  }

  return projections.sort((a, b) => a.goalId.localeCompare(b.goalId));
}
