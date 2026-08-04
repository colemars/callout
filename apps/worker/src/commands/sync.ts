import type { PlatformDb } from "@platform/database";
import { categoryRules } from "@platform/database";
import type { SyncReport } from "@platform/ingestion";
import {
  createCategorizer,
  createPlaidClient,
  createPlaidInvestmentsProvider,
  createPlaidProvider,
  runSync,
} from "@platform/ingestion";
import {
  createAccountRepository,
  createConnectionStore,
  createInvestmentActivityRepository,
  createSnapshotRepository,
  createTransactionRepository,
  createVaultTokenStore,
} from "@platform/repositories";
import { eq } from "drizzle-orm";
import { platformUser, requireEnv, todayUtc } from "../env.js";

export async function runSyncCommand(db: PlatformDb): Promise<SyncReport[]> {
  const user = platformUser();

  const rules = await db.select().from(categoryRules).where(eq(categoryRules.source, "plaid"));
  const categorize = createCategorizer(new Map(rules.map((r) => [r.sourceCategory, r.category])));

  const plaidEnv = process.env.PLAID_ENV === "production" ? "production" : "sandbox";
  const client = createPlaidClient({
    clientId: requireEnv("PLAID_CLIENT_ID"),
    secret: requireEnv("PLAID_SECRET"),
    env: plaidEnv,
  });
  const provider = createPlaidProvider(client);

  return runSync(user, {
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
    categorize,
    today: todayUtc(),
    now: () => new Date(),
  });
}
