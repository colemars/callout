import type { PlatformDb } from "@platform/database";
import { categoryRules, providerConnections } from "@platform/database";
import type { UserId } from "@platform/financial-core";
import { userId } from "@platform/financial-core";
import type { SyncReport } from "@platform/ingestion";
import type { ScribeReport } from "@platform/ingestion";
import {
  createAnthropicClient,
  createCategorizer,
  createPlaidClient,
  createPlaidInvestmentsProvider,
  createPlaidProvider,
  runScribe,
  runSync,
} from "@platform/ingestion";
import {
  createAccountRepository,
  createConnectionStore,
  createInvestmentActivityRepository,
  createScribeStore,
  createSnapshotRepository,
  createTransactionRepository,
  createUserCategoryRuleStore,
  createVaultTokenStore,
} from "@platform/repositories";
import { eq } from "drizzle-orm";
import { requireEnv, todayUtc } from "../env.js";

/** Every user with at least one provider connection — the sync roster. */
export async function connectedUsers(db: PlatformDb): Promise<UserId[]> {
  const rows = await db
    .selectDistinct({ userId: providerConnections.userId })
    .from(providerConnections);
  return rows.map((r) => userId(r.userId));
}

export interface UserSyncReport {
  readonly userId: UserId;
  readonly reports: SyncReport[];
  /** Present only when the AI scribe is configured (ANTHROPIC_API_KEY). */
  readonly scribe?: ScribeReport;
}

export async function runSyncCommand(db: PlatformDb): Promise<UserSyncReport[]> {
  const rules = await db.select().from(categoryRules).where(eq(categoryRules.source, "plaid"));
  const globalRules = new Map(rules.map((r) => [r.sourceCategory, r.category]));

  const plaidEnv = process.env.PLAID_ENV === "production" ? "production" : "sandbox";
  const client = createPlaidClient({
    clientId: requireEnv("PLAID_CLIENT_ID"),
    secret: requireEnv("PLAID_SECRET"),
    env: plaidEnv,
  });
  const provider = createPlaidProvider(client);
  const userRuleStore = createUserCategoryRuleStore(db);

  const shared = {
    provider,
    investments: {
      provider: createPlaidInvestmentsProvider(client),
      repo: createInvestmentActivityRepository(db),
    },
    tokens: createVaultTokenStore(db),
    connections: createConnectionStore(db),
    accountRepo: createAccountRepository(db),
    transactionRepo: createTransactionRepository(db),
    snapshotRepo: createSnapshotRepository(db),
    today: todayUtc(),
    now: () => new Date(),
  };

  // Feature-off without a key: plain optional read, never required.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ai = anthropicKey ? createAnthropicClient({ apiKey: anthropicKey }) : undefined;

  const results: UserSyncReport[] = [];
  for (const user of await connectedUsers(db)) {
    // Per-user categorizer: their corrections and the scribe's learned rules.
    const userRules = await userRuleStore.listForUser(user, "plaid");
    const categorize = createCategorizer(globalRules, userRules);
    const reports = await runSync(user, { ...shared, categorize });
    const scribe =
      ai === undefined
        ? undefined
        : await runScribe(user, {
            ai,
            store: createScribeStore(db),
            rules: userRuleStore,
            today: shared.today,
          });
    results.push({ userId: user, reports, ...(scribe === undefined ? {} : { scribe }) });
  }
  return results;
}
