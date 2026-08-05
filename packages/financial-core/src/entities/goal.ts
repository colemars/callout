import type { ISODate } from "../dates/local-date.js";
import type { AccountId, GoalId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

interface GoalBase {
  readonly id: GoalId;
  readonly userId: UserId;
  readonly targetAmount: Money;
  readonly targetDate?: ISODate;
  /**
   * Evaluation baseline: where the goal started and when. The insight engine
   * interpolates expected progress linearly from (startedAt, baselineAmount)
   * to (targetDate, targetAmount); goals missing these are not evaluated.
   */
  readonly startedAt?: ISODate;
  readonly baselineAmount?: Money;
  readonly note?: string;
  readonly active: boolean;
  readonly createdAt?: ISODate;
}

/** Creation shape: the platform assigns id; startedAt/baseline set at creation. */
export type NewGoal =
  | (Omit<SavingsNetFlowGoal, "id" | "userId"> & { kind: "savings_net_flow" })
  | (Omit<BalanceTargetGoal, "id" | "userId"> & { kind: "balance_target" })
  | (Omit<DebtPaydownGoal, "id" | "userId"> & { kind: "debt_paydown" });

/** Save at least targetAmount of net flow (per targetDate horizon). */
export interface SavingsNetFlowGoal extends GoalBase {
  readonly kind: "savings_net_flow";
}

/** Grow a specific account's balance to targetAmount. */
export interface BalanceTargetGoal extends GoalBase {
  readonly kind: "balance_target";
  readonly accountId: AccountId;
}

/** Pay a specific debt account down to targetAmount. */
export interface DebtPaydownGoal extends GoalBase {
  readonly kind: "debt_paydown";
  readonly accountId: AccountId;
}

export type Goal = SavingsNetFlowGoal | BalanceTargetGoal | DebtPaydownGoal;
