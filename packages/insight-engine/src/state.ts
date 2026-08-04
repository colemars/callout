import type {
  Account,
  BalanceSnapshot,
  Budget,
  Goal,
  InvestmentActivity,
  Transaction,
  UserId,
} from "@platform/financial-core";

/** Everything the engine reads. Repositories assemble this; the engine never fetches. */
export interface FinancialState {
  readonly userId: UserId;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly budgets: readonly Budget[];
  readonly goals: readonly Goal[];
  readonly snapshots: readonly BalanceSnapshot[];
  /** Plaid Investments records; empty when the product isn't connected. */
  readonly investmentActivity: readonly InvestmentActivity[];
}
