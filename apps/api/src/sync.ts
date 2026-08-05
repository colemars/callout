// On-demand, single-user sync: runs right after the Counting House links a
// bank so the first census doesn't wait for the daily worker. Same building
// blocks as the worker's sync command, scoped to one user, plus an insights
// refresh so the kingdom renders immediately.
import type { PlatformDb } from "@platform/database";
import { categoryRules } from "@platform/database";
import type { UserId } from "@platform/financial-core";
import { isoDate } from "@platform/financial-core";
import type { ScribeReport, SyncReport } from "@platform/ingestion";
import {
  createAnthropicClient,
  createCategorizer,
  createPlaidClient,
  createPlaidInvestmentsProvider,
  createPlaidLiabilitiesProvider,
  createPlaidProvider,
  runScribe,
  runSync,
} from "@platform/ingestion";
import { computeMetrics, defaultEngineConfig, deriveEvents } from "@platform/insight-engine";
import {
  createAccountRepository,
  createConnectionStore,
  createEventStore,
  createGoalRepository,
  createInvestmentActivityRepository,
  createLiabilityRepository,
  createMetricSnapshotStore,
  createScribeStore,
  createSnapshotRepository,
  createTransactionRepository,
  createUserCategoryRuleStore,
  createVaultTokenStore,
  loadFinancialState,
} from "@platform/repositories";
import { eq } from "drizzle-orm";

export interface UserSyncResult {
  readonly reports: SyncReport[];
  readonly newEvents: number;
  /** Present only when the AI scribe is configured. */
  readonly scribe?: ScribeReport;
}

export type UserSync = (
  userId: UserId,
  /** Restrict to one connection — webhook-targeted syncs stay cheap. */
  opts?: { readonly connectionId?: string },
) => Promise<UserSyncResult>;

export function createUserSync(
  db: PlatformDb,
  plaid: { clientId: string; secret: string; env: "sandbox" | "production" },
  anthropic?: { apiKey: string },
): UserSync {
  const client = createPlaidClient(plaid);
  // This runs inside POST /sync's 29s API Gateway budget — a hung model call
  // must not eat it. Timeout = unresolved; the nightly worker catches up.
  const ai =
    anthropic === undefined
      ? undefined
      : createAnthropicClient({ apiKey: anthropic.apiKey }, (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(8000) }),
        );
  return async (userId, opts) => {
    const rules = await db.select().from(categoryRules).where(eq(categoryRules.source, "plaid"));
    const userRules = await createUserCategoryRuleStore(db).listForUser(userId, "plaid");
    const categorize = createCategorizer(
      new Map(rules.map((r) => [r.sourceCategory, r.category])),
      userRules,
    );

    const reports = await runSync(
      userId,
      {
        provider: createPlaidProvider(client),
        investments: {
          provider: createPlaidInvestmentsProvider(client),
          repo: createInvestmentActivityRepository(db),
        },
        liabilities: {
          provider: createPlaidLiabilitiesProvider(client),
          repo: createLiabilityRepository(db),
        },
        tokens: createVaultTokenStore(db),
        connections: createConnectionStore(db),
        accountRepo: createAccountRepository(db),
        transactionRepo: createTransactionRepository(db),
        snapshotRepo: createSnapshotRepository(db),
        categorize,
        today: isoDate(new Date().toISOString().slice(0, 10)),
        now: () => new Date(),
      },
      opts?.connectionId === undefined ? undefined : { connectionId: opts.connectionId },
    );

    // The scribe runs BEFORE the insights refresh so recategorizations land
    // in the snapshot the kingdom renders next.
    const asOf = isoDate(new Date().toISOString().slice(0, 10));
    const scribe =
      ai === undefined
        ? undefined
        : await runScribe(userId, {
            ai,
            store: createScribeStore(db),
            rules: createUserCategoryRuleStore(db),
            today: asOf,
          });

    // Refresh insights so the kingdom shows the new data without waiting for
    // the daily run. Same once-per-day event idempotence as the worker.
    const metricStore = createMetricSnapshotStore(db);
    const state = await loadFinancialState(db, userId);
    const previous = await metricStore.latest(userId);
    const current = computeMetrics(state, defaultEngineConfig, asOf);
    const alreadyRanToday = previous !== null && previous.asOf === asOf;
    const events = alreadyRanToday ? [] : deriveEvents(previous, current, defaultEngineConfig);
    await metricStore.save(current);
    await createEventStore(db).insertMany(events);

    // A fulfilled oath retires: completion deactivates the goal so it stops
    // being paced (the event is already in the ledger).
    const goalRepo = createGoalRepository(db);
    for (const e of events) {
      if (e.type === "GOAL_COMPLETED") await goalRepo.update(userId, e.goalId, { active: false });
    }

    return { reports, newEvents: events.length, ...(scribe === undefined ? {} : { scribe }) };
  };
}
