/**
 * API-view types shared by product frontends. Typed against what /api/v1
 * serves — products consume the API, never platform internals.
 */

export interface ApiMoney {
  amountMinor: number;
  currency: string;
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  kind: string;
  mask?: string;
  balance: ApiMoney;
}

export interface Txn {
  id: string;
  postedAt: string;
  description: string;
  merchant?: string;
  amount: ApiMoney;
  category: string;
  pending: boolean;
}

export interface ApiEvent {
  type: string;
  occurredOn: string;
  payload: Record<string, unknown>;
}

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

/** The slices of the engine's MetricSet products render. */
export interface MetricsView {
  budgetStatus?: BudgetStatus[];
  debtTrajectory?: DebtEntry[];
  recurringCandidates?: RecurringCandidate[];
  totalHighInterestDebt?: ApiMoney;
  emergencyRunwayMonths?: number | null;
  mtd?: { netCashFlow: ApiMoney; totalSpending: ApiMoney };
}

export interface DashboardData {
  accounts: Account[];
  transactions: Txn[];
  events: ApiEvent[];
  metrics: MetricsView | null;
}

/** A translated event in some product's voice. */
export interface TranslatedEvent {
  headline: string;
  tone: "good" | "bad" | "info";
}

export type EventTranslator = (event: ApiEvent) => TranslatedEvent;
