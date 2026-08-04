import type { PlatformDb } from "@platform/database";
import { events, metricSnapshots } from "@platform/database";
import type { FinancialEvent, ISODate, UserId } from "@platform/financial-core";
import type { MetricSet } from "@platform/insight-engine";
import { desc, eq } from "drizzle-orm";

/** Persistence for the insight engine's outputs (metric snapshots + events). */
export interface MetricSnapshotStore {
  save(metricSet: MetricSet): Promise<void>;
  latest(userId: UserId): Promise<MetricSet | null>;
}

export interface EventStore {
  insertMany(eventsToInsert: readonly FinancialEvent[]): Promise<void>;
  listRecent(userId: UserId, limit: number): Promise<FinancialEvent[]>;
}

export function createMetricSnapshotStore(db: PlatformDb): MetricSnapshotStore {
  return {
    async save(metricSet: MetricSet) {
      const values = { userId: metricSet.userId, asOf: metricSet.asOf, data: metricSet };
      await db
        .insert(metricSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [metricSnapshots.userId, metricSnapshots.asOf],
          set: { data: metricSet },
        });
    },

    async latest(userId: UserId) {
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(eq(metricSnapshots.userId, userId))
        .orderBy(desc(metricSnapshots.asOf))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : (row.data as MetricSet);
    },
  };
}

export function createEventStore(db: PlatformDb): EventStore {
  return {
    async insertMany(eventsToInsert: readonly FinancialEvent[]) {
      if (eventsToInsert.length === 0) return;
      await db.insert(events).values(
        eventsToInsert.map((e) => ({
          userId: e.userId,
          occurredOn: e.occurredOn as ISODate,
          type: e.type,
          payload: e,
        })),
      );
    },

    async listRecent(userId: UserId, limit: number) {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.userId, userId))
        .orderBy(desc(events.createdAt))
        .limit(limit);
      return rows.map((r) => r.payload as FinancialEvent);
    },
  };
}
