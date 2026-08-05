import type { PlatformDb } from "@platform/database";
import { events, metricSnapshots } from "@platform/database";
import type { FinancialEvent, ISODate, UserId } from "@platform/financial-core";
import { type MetricSet, eventDedupKey } from "@platform/insight-engine";
import { and, asc, desc, eq, gt, gte, lte } from "drizzle-orm";

/** Persistence for the insight engine's outputs (metric snapshots + events). */
export interface MetricSnapshotStore {
  save(metricSet: MetricSet): Promise<void>;
  latest(userId: UserId): Promise<MetricSet | null>;
  /** Snapshots with from <= asOf <= to, ascending — the kingdom's timeline. */
  listRange(userId: UserId, from: ISODate, to: ISODate): Promise<MetricSet[]>;
}

/**
 * An event plus its persistence identity. occurredOn is the date the event
 * DESCRIBES; createdAt is when it was derived. `seq` is the monotonic
 * insertion cursor — exact and loss-free (createdAt is shared by whole
 * batches and truncates to ms in transit).
 */
export interface StoredEvent {
  event: FinancialEvent;
  id: string;
  seq: number;
  createdAt: string;
}

export interface EventStore {
  /** Dedup-guarded: re-deriving the same events is a no-op, never a double. */
  insertMany(eventsToInsert: readonly FinancialEvent[]): Promise<void>;
  listRecent(userId: UserId, limit: number): Promise<StoredEvent[]>;
  /** Events created strictly after `since` (ISO timestamp), ascending. */
  listSince(userId: UserId, since: Date, limit: number): Promise<StoredEvent[]>;
  /** Events with seq strictly greater, ascending — THE exact cursor. */
  listSinceSeq(userId: UserId, sinceSeq: number, limit: number): Promise<StoredEvent[]>;
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

    async listRange(userId: UserId, from: ISODate, to: ISODate) {
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            gte(metricSnapshots.asOf, from),
            lte(metricSnapshots.asOf, to),
          ),
        )
        .orderBy(asc(metricSnapshots.asOf));
      return rows.map((r) => r.data as MetricSet);
    },
  };
}

const toStored = (r: {
  id: string;
  seq: number;
  payload: unknown;
  createdAt: Date;
}): StoredEvent => ({
  event: r.payload as FinancialEvent,
  id: r.id,
  seq: r.seq,
  createdAt: r.createdAt.toISOString(),
});

export function createEventStore(db: PlatformDb): EventStore {
  return {
    async insertMany(eventsToInsert: readonly FinancialEvent[]) {
      if (eventsToInsert.length === 0) return;
      await db
        .insert(events)
        .values(
          eventsToInsert.map((e) => ({
            userId: e.userId,
            occurredOn: e.occurredOn as ISODate,
            type: e.type,
            dedupKey: eventDedupKey(e),
            payload: e,
          })),
        )
        // Concurrent derivation (worker overlapping POST /sync) resolves to
        // one row — the event stream is a ledger, not a log.
        .onConflictDoNothing({
          target: [events.userId, events.type, events.occurredOn, events.dedupKey],
        });
    },

    async listRecent(userId: UserId, limit: number) {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.userId, userId))
        .orderBy(desc(events.seq))
        .limit(limit);
      return rows.map(toStored);
    },

    async listSince(userId: UserId, since: Date, limit: number) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.userId, userId), gt(events.createdAt, since)))
        .orderBy(asc(events.seq))
        .limit(limit);
      return rows.map(toStored);
    },

    async listSinceSeq(userId: UserId, sinceSeq: number, limit: number) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.userId, userId), gt(events.seq, sinceSeq)))
        .orderBy(asc(events.seq))
        .limit(limit);
      return rows.map(toStored);
    },
  };
}
