import type { PlatformDb } from "@platform/database";
import {
  accountLiabilities,
  accounts,
  balanceSnapshots,
  budgets,
  events,
  goals,
  investmentActivity,
  metricSnapshots,
  productState,
  providerConnections,
  transactions,
  userCategoryRules,
} from "@platform/database";
import type { UserId } from "@platform/financial-core";
import { eq, sql } from "drizzle-orm";

/**
 * Data rights (ARCHITECTURE.md "Security, Privacy & Trust"): the full wipe
 * behind DELETE /api/v1/data. Row deletion is ATOMIC — one transaction, so
 * a mid-wipe failure leaves the account whole, never half-erased. Vault
 * tokens are deleted after the commit; a failed vault delete is REPORTED
 * (orphanedTokens), never swallowed — an unrecorded live credential is the
 * worst kind of orphan. The auth user survives — they can relink.
 */
export interface WipeReport {
  readonly deleted: Record<string, number>;
  /** Vault secrets removed (one per connection). */
  readonly tokensDeleted: number;
  /** Vault secret ids that could NOT be deleted — surface these loudly. */
  readonly orphanedTokens: readonly string[];
}

export async function deleteAllUserData(db: PlatformDb, userId: UserId): Promise<WipeReport> {
  // Collect vault secret ids BEFORE deleting the rows that reference them —
  // once provider_connections is gone, these ids exist nowhere else.
  const connections = await db
    .select({ secretId: providerConnections.accessTokenSecretId })
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId));

  const tables = [
    ["account_liabilities", accountLiabilities],
    ["balance_snapshots", balanceSnapshots],
    ["investment_activity", investmentActivity],
    ["transactions", transactions],
    ["goals", goals],
    ["budgets", budgets],
    ["events", events],
    ["metric_snapshots", metricSnapshots],
    ["product_state", productState],
    ["user_category_rules", userCategoryRules],
    ["accounts", accounts],
    ["provider_connections", providerConnections],
  ] as const;

  const deleted: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const [name, table] of tables) {
      const rows = await tx
        .delete(table)
        .where(eq(table.userId, userId))
        .returning({ userId: table.userId });
      deleted[name] = rows.length;
    }
  });

  let tokensDeleted = 0;
  const orphanedTokens: string[] = [];
  for (const c of connections) {
    try {
      await db.execute(sql`select public.delete_plaid_token(${c.secretId}::uuid)`);
      tokensDeleted++;
    } catch {
      orphanedTokens.push(c.secretId);
    }
  }

  return { deleted, tokensDeleted, orphanedTokens };
}
