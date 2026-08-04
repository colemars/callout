export type { EngineConfig } from "./config.js";
export { defaultEngineConfig } from "./config.js";
export type { FinancialState } from "./state.js";
export type {
  BudgetStatus,
  CategorySpend,
  DebtTrajectoryEntry,
  GoalStatus,
  InvestmentSummary,
  MetricSet,
  MonthSummary,
  RecurringCandidate,
} from "./metrics.js";
export { computeMetrics } from "./compute.js";
export { deriveEvents } from "./events.js";
export type { GoalProjection } from "./projections.js";
export { project } from "./projections.js";
