import type { Category, CurrencyCode } from "@platform/financial-core";

/**
 * Tunable thresholds. Everything the engine does is a pure function of
 * (state, config, asOf) — changing config changes outputs, nothing else does.
 */
export interface EngineConfig {
  readonly currency: CurrencyCode;
  /** Categories that move money rather than spend it; excluded from spending metrics. */
  readonly nonSpendingCategories: readonly Category[];
  /** Categories excluded from net cash flow (internal movements). */
  readonly nonCashFlowCategories: readonly Category[];
  /** Essential categories used for the emergency-runway denominator. */
  /** UNCATEGORIZED_FUNDS fires when a completed month's net 'other' flow reaches this. */
  readonly uncategorizedThresholdMinor: number;
  readonly essentialCategories: readonly Category[];
  /** Month-over-month spending change is reported only when BOTH thresholds pass. */
  readonly spendingDeltaThresholdPct: number;
  readonly spendingDeltaThresholdMinor: number;
  /** Recurring-merchant detection (ported from callout's v_recurring_candidates). */
  readonly recurringMinHits: number;
  readonly recurringMinGapDays: number;
  readonly recurringMaxGapDays: number;
  readonly recurringStddevPctOfAvg: number;
  readonly recurringStddevFloorMinor: number;
  /** Recurring-income gap window — the floor admits biweekly payroll. */
  readonly recurringIncomeMinGapDays: number;
  readonly recurringIncomeMaxGapDays: number;
  /** Account kinds counted as high-interest debt. */
  readonly highInterestKinds: readonly ("credit" | "loan")[];
  /** Minimum change in high-interest debt (minor units) worth an event. */
  readonly debtDeltaThresholdMinor: number;
  /** Minimum change in emergency runway (months) worth an event. */
  readonly runwayChangeThresholdMonths: number;
  /** Full months of history used for the runway spending average. */
  readonly runwayLookbackMonths: number;
  /** Runway tiers (months) that chronicle a milestone when crossed upward. */
  readonly emergencyFundTiersMonths: readonly number[];
  /** Savings-rate tiers (percent) that chronicle a milestone when crossed upward. */
  readonly savingsRateTiersPct: readonly number[];
  /** An under-budget streak announces itself from this many months on. */
  readonly underBudgetStreakMinMonths: number;
}

export const defaultEngineConfig: EngineConfig = {
  currency: "USD",
  nonSpendingCategories: ["transfer", "debt_payment", "income"],
  nonCashFlowCategories: ["transfer", "debt_payment"],
  uncategorizedThresholdMinor: 200_00,
  essentialCategories: ["groceries", "housing", "transport", "health"],
  spendingDeltaThresholdPct: 20,
  spendingDeltaThresholdMinor: 25_00,
  recurringMinHits: 3,
  recurringMinGapDays: 25,
  recurringMaxGapDays: 35,
  recurringStddevPctOfAvg: 0.15,
  recurringStddevFloorMinor: 2_00,
  recurringIncomeMinGapDays: 10,
  recurringIncomeMaxGapDays: 35,
  highInterestKinds: ["credit"],
  debtDeltaThresholdMinor: 100_00,
  runwayChangeThresholdMonths: 0.5,
  runwayLookbackMonths: 3,
  emergencyFundTiersMonths: [1, 3, 6, 12],
  savingsRateTiersPct: [5, 10, 20, 30],
  underBudgetStreakMinMonths: 2,
};
