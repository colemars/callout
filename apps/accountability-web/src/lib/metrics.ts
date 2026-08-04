import type { ApiMoney } from "./format";

/**
 * The slices of the engine's MetricSet this product renders. Typed locally:
 * products consume the API, not platform packages (only the SDK).
 */
export interface BudgetStatus {
  category: string;
  monthlyCap: ApiMoney;
  spentMtd: ApiMoney;
  proratedCap: ApiMoney;
  pctOfMonthlyCap: number;
  overPace: boolean;
}

export interface DebtEntry {
  accountId: string;
  name: string;
  institution: string;
  currentBalance: ApiMoney;
  delta30d: ApiMoney | null;
  delta60d: ApiMoney | null;
  delta90d: ApiMoney | null;
}

export interface RecurringCandidate {
  merchant: string;
  averageAmount: ApiMoney;
  averageGapDays: number;
  lastSeen: string;
}

export interface MetricsView {
  budgetStatus?: BudgetStatus[];
  debtTrajectory?: DebtEntry[];
  recurringCandidates?: RecurringCandidate[];
  totalHighInterestDebt?: ApiMoney;
  emergencyRunwayMonths?: number | null;
  mtd?: { netCashFlow: ApiMoney; totalSpending: ApiMoney };
}
