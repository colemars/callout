import type { PlatformDb } from "@platform/database";
import { categoryRules } from "@platform/database";
import { money } from "@platform/financial-core";
import { createCategorizer, importAppleCardCsv } from "@platform/ingestion";
import { createAccountRepository, createTransactionRepository } from "@platform/repositories";
import { eq } from "drizzle-orm";
import { platformUser, todayUtc } from "../env.js";

/** Imports an Apple Card statement CSV into a dedicated apple_csv account. */
export async function runImportCsv(db: PlatformDb, csvText: string): Promise<{ imported: number }> {
  const user = platformUser();

  const rules = await db.select().from(categoryRules).where(eq(categoryRules.source, "apple_csv"));
  const categorize = createCategorizer(new Map(rules.map((r) => [r.sourceCategory, r.category])));

  const account = await createAccountRepository(db).upsertByExternalId(user, {
    userId: user,
    source: "apple_csv",
    externalId: "apple-card",
    name: "Apple Card",
    institution: "Apple",
    kind: "credit",
    balance: money(0),
    balanceAsOf: todayUtc(),
    isActive: true,
  });

  return importAppleCardCsv(user, account.id, csvText, categorize, createTransactionRepository(db));
}
