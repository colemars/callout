// On-demand, single-user sync: runs right after the Counting House links a
// bank so the first census doesn't wait for the daily worker. Same building
// blocks as the worker's sync command, scoped to one user, plus an insights
// refresh so the kingdom renders immediately.
import type { PlatformDb } from "@platform/database";
import { categoryRules } from "@platform/database";
import type { UserId } from "@platform/financial-core";
import { isoDate } from "@platform/financial-core";
import type { SyncReport } from "@platform/ingestion";
import {
  createCategorizer,
  createPlaidClient,
  createPlaidInvestmentsProvider,
  createPlaidProvider,
  runSync,
} from "@platform/ingestion";
import { computeMetrics, defaultEngineConfig, deriveEvents } from "@platform/insight-engine";
import {
  createAccountRepository,
  createConnectionStore,
  createEventStore,
  createInvestmentActivityRepository,
  createMetricSnapshotStore,
  createSnapshotRepository,
  createTransactionRepository,
  createVaultTokenStore,
  loadFinancialState,
} from "@platform/repositories";
import { eq } from "drizzle-orm";

export interface UserSyncResult {
  readonly reports: SyncReport[];
  readonly newEvents: number;
}

export type UserSync = (userId: UserId) => Promise<UserSyncResult>;

export function createUserSync(
  db: PlatformDb,
  plaid: { clientId: string; secret: string; env: "sandbox" | "production" },
): UserSync {
  const client = createPlaidClient(plaid);
  return async (userId) => {
    const rules = await db.select().from(categoryRules).where(eq(categoryRules.source, "plaid"));
    const categorize = createCategorizer(new Map(rules.map((r) => [r.sourceCategory, r.category])));

    const reports = await runSync(userId, {
      provider: createPlaidProvider(client),
      investments: {
        provider: createPlaidInvestmentsProvider(client),
        repo: createInvestmentActivityRepository(db),
      },
      tokens: createVaultTokenStore(db),
      connections: createConnectionStore(db),
      accountRepo: createAccountRepository(db),
      transactionRepo: createTransactionRepository(db),
      snapshotRepo: createSnapshotRepository(db),
      categorize,
      today: isoDate(new Date().toISOString().slice(0, 10)),
      now: () => new Date(),
    });

    // Refresh insights so the kingdom shows the new data without waiting for
    // the daily run. Same once-per-day event idempotence as the worker.
    const asOf = isoDate(new Date().toISOString().slice(0, 10));
    const metricStore = createMetricSnapshotStore(db);
    const state = await loadFinancialState(db, userId);
    const previous = await metricStore.latest(userId);
    const current = computeMetrics(state, defaultEngineConfig, asOf);
    const alreadyRanToday = previous !== null && previous.asOf === asOf;
    const events = alreadyRanToday ? [] : deriveEvents(previous, current, defaultEngineConfig);
    await metricStore.save(current);
    await createEventStore(db).insertMany(events);

    return { reports, newEvents: events.length };
  };
}
