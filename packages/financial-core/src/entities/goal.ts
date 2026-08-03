import type { ISODate } from "../dates/local-date.js";
import type { AccountId, GoalId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

interface GoalBase {
  readonly id: GoalId;
  readonly userId: UserId;
  readonly targetAmount: Money;
  readonly targetDate?: ISODate;
  readonly note?: string;
  readonly active: boolean;
}

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
