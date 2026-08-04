import type {
  AccountId,
  AccountKind,
  Category,
  CurrencyCode,
  GoalId,
  ISODate,
  ISOMonth,
  Money,
  UserId,
} from "@platform/financial-core";

/** Positive Money: how much was spent (outflows, magnitude). */
export interface CategorySpend {
  readonly category: Category;
  readonly amount: Money;
}

export interface MonthSummary {
  readonly month: ISOMonth;
  readonly transactionCount: number;
  /** Positive magnitude of spending (outflows in spending categories). */
  readonly totalSpending: Money;
  readonly spendingByCategory: readonly CategorySpend[];
  /** Signed inflow+outflow across cash-flow categories. */
  readonly netCashFlow: Money;
}

/** Ported from callout's v_budget_status. */
export interface BudgetStatus {
  readonly category: Category;
  readonly monthlyCap: Money;
  readonly spentMtd: Money;
  /** Cap prorated to the elapsed fraction of the month. */
  readonly proratedCap: Money;
  readonly pctOfMonthlyCap: number;
  readonly overPace: boolean;
}

/** Ported from callout's v_debt_trajectory. */
export interface DebtTrajectoryEntry {
  readonly accountId: AccountId;
  readonly name: string;
  readonly institution: string;
  readonly kind: AccountKind;
  readonly currentBalance: Money;
  readonly delta30d: Money | null;
  readonly delta60d: Money | null;
  readonly delta90d: Money | null;
}

/** Ported from callout's v_recurring_candidates. */
export interface RecurringCandidate {
  readonly merchant: string;
  readonly hits: number;
  /** Positive magnitude of the typical charge. */
  readonly averageAmount: Money;
  readonly firstSeen: ISODate;
  readonly lastSeen: ISODate;
  readonly averageGapDays: number;
}

export interface GoalStatus {
  readonly goalId: GoalId;
  readonly kind: "savings_net_flow" | "balance_target" | "debt_paydown";
  /** False when the goal lacks startedAt/baselineAmount/targetDate. */
  readonly evaluable: boolean;
  readonly onTrack: boolean | null;
  readonly expected: Money | null;
  readonly actual: Money | null;
}

/**
 * The engine's complete, explainable output for one user at one date.
 * deriveEvents() diffs two of these; Phase 4 persists them as metric_snapshots.
 */
export interface MetricSet {
  readonly userId: UserId;
  readonly asOf: ISODate;
  readonly currency: CurrencyCode;
  readonly month: ISOMonth;
  /** Month-to-date summary for asOf's month. */
  readonly mtd: MonthSummary;
  /** The full month immediately before asOf's month. */
  readonly completedMonth: MonthSummary;
  /** The month before completedMonth (baseline for spending comparisons). */
  readonly priorMonth: MonthSummary;
  readonly budgetStatus: readonly BudgetStatus[];
  readonly debtTrajectory: readonly DebtTrajectoryEntry[];
  /** Sum of balances across active accounts of the configured high-interest kinds. */
  readonly totalHighInterestDebt: Money;
  readonly recurringCandidates: readonly RecurringCandidate[];
  readonly goalStatuses: readonly GoalStatus[];
  /** Liquid balance ÷ average monthly essential spend; null when not computable. */
  readonly emergencyRunwayMonths: number | null;
}
