import type { PlatformDb } from "@platform/database";
import { accounts } from "@platform/database";
import type { FinancialEvent, UserId } from "@platform/financial-core";
import { userId } from "@platform/financial-core";
import { computeMetrics, defaultEngineConfig, deriveEvents } from "@platform/insight-engine";
import {
  createEventStore,
  createMetricSnapshotStore,
  loadFinancialState,
} from "@platform/repositories";
import { todayUtc } from "../env.js";

export interface UserInsightsSummary {
  readonly userId: UserId;
  readonly transactionCount: number;
  readonly accountCount: number;
  /** True when a snapshot for today already existed — snapshot refreshed, no events re-emitted. */
  readonly alreadyRanToday: boolean;
  readonly newEvents: FinancialEvent[];
}

export interface InsightsSummary {
  readonly asOf: string;
  readonly users: UserInsightsSummary[];
}

/** Every user with any account — synced connections, CSV imports, whatever landed data. */
async function usersWithData(db: PlatformDb): Promise<UserId[]> {
  const rows = await db.selectDistinct({ userId: accounts.userId }).from(accounts);
  return rows.map((r) => userId(r.userId));
}

export async function runInsights(db: PlatformDb): Promise<InsightsSummary> {
  const asOf = todayUtc();
  const metricStore = createMetricSnapshotStore(db);
  const eventStore = createEventStore(db);

  const users: UserInsightsSummary[] = [];
  for (const user of await usersWithData(db)) {
    const state = await loadFinancialState(db, user);
    const previous = await metricStore.latest(user);
    const current = computeMetrics(state, defaultEngineConfig, asOf);

    // Idempotence: one event-derivation per user per calendar day. A same-day
    // re-run refreshes the snapshot but must not re-announce the same transitions.
    const alreadyRanToday = previous !== null && previous.asOf === asOf;
    const events = alreadyRanToday ? [] : deriveEvents(previous, current, defaultEngineConfig);

    await metricStore.save(current);
    await eventStore.insertMany(events);

    users.push({
      userId: user,
      transactionCount: state.transactions.length,
      accountCount: state.accounts.length,
      alreadyRanToday,
      newEvents: events,
    });
  }

  return { asOf, users };
}
