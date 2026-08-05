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
  /** The actual reached the target (≤ for paydown, ≥ otherwise). */
  readonly completed: boolean;
  readonly target: Money;
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
  /** Plaid Investments summary (contributions + passive income). */
  readonly investments: InvestmentSummary;
  /** Money the categorizer couldn't place — miscategorization must be loud. */
  readonly uncategorized: UncategorizedSummary;
  /** Trailing income average — one hot or cold month is not a trend. */
  readonly incomeBaseline: IncomeBaseline;
  /** Trailing savings rate — the share of income kept, over 3 full months. */
  readonly savingsRate: SavingsRate;
  /**
   * Fingerprint of the active account set. When two snapshots differ here,
   * debt/runway deltas may reflect linking or unlinking rather than behavior —
   * milestone events are suppressed and delta events flagged across the gap.
   */
  readonly accountFingerprint: string;
  /** Consecutive completed months every active budget held (post-issuance only). */
  readonly underBudgetStreak: UnderBudgetStreak;
}

export interface SavingsRate {
  /** Full months with activity that informed the rate (up to 3). */
  readonly monthsCounted: number;
  /** Σ net cash flow ÷ Σ income, as a percent; null under 2 months or non-positive income. */
  readonly pct: number | null;
}

export interface UnderBudgetStreak {
  /**
   * Consecutive completed months (ending with the latest completed month) in
   * which every active budget's category spend stayed at or under its cap.
   * Only months strictly after the newest budget's creation month count —
   * a streak must be earned under watch, never backdated.
   */
  readonly months: number;
}

export interface IncomeBaseline {
  /** Full months with activity that informed the average (up to 6). */
  readonly monthsCounted: number;
  /** Average monthly income (net cash flow + spending); null under 2 months of data. */
  readonly averageMonthly: Money | null;
}

export interface UncategorizedSummary {
  readonly completedMonthCount: number;
  /** Magnitude of the completed month's net 'other' flow. */
  readonly completedMonthNet: Money;
}

export interface InvestmentSummary {
  /** Contributions (explicit records only — never balance deltas). */
  readonly contributionsMtd: Money;
  readonly contributionsCompletedMonth: Money;
  readonly contributionsPriorMonth: Money;
  /** Dividends + interest for the completed / prior month. */
  readonly passiveIncomeCompletedMonth: Money;
  readonly passiveIncomePriorMonth: Money;
  /**
   * Average monthly passive income over the trailing 3 full months.
   * Null when no investment activity exists at all — "no data" is not $0.
   */
  readonly passiveIncomeMonthly: Money | null;
}
