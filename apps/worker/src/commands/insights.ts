import type { PlatformDb } from "@platform/database";
import type { FinancialEvent } from "@platform/financial-core";
import { computeMetrics, defaultEngineConfig, deriveEvents } from "@platform/insight-engine";
import {
  createEventStore,
  createMetricSnapshotStore,
  loadFinancialState,
} from "@platform/repositories";
import { platformUser, todayUtc } from "../env.js";

export interface InsightsSummary {
  readonly asOf: string;
  readonly transactionCount: number;
  readonly accountCount: number;
  /** True when a snapshot for today already existed — snapshot refreshed, no events re-emitted. */
  readonly alreadyRanToday: boolean;
  readonly newEvents: FinancialEvent[];
}

export async function runInsights(db: PlatformDb): Promise<InsightsSummary> {
  const user = platformUser();
  const asOf = todayUtc();

  const state = await loadFinancialState(db, user);
  const metricStore = createMetricSnapshotStore(db);

  const previous = await metricStore.latest(user);
  const current = computeMetrics(state, defaultEngineConfig, asOf);

  // Idempotence: one event-derivation per calendar day. A same-day re-run
  // refreshes the snapshot but must not re-announce the same transitions.
  const alreadyRanToday = previous !== null && previous.asOf === asOf;
  const events = alreadyRanToday ? [] : deriveEvents(previous, current, defaultEngineConfig);

  await metricStore.save(current);
  await createEventStore(db).insertMany(events);

  return {
    asOf,
    transactionCount: state.transactions.length,
    accountCount: state.accounts.length,
    alreadyRanToday,
    newEvents: events,
  };
}
