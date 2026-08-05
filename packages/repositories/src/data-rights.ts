import type { PlatformDb } from "@platform/database";
import {
  events,
  accountLiabilities,
  accounts,
  balanceSnapshots,
  budgets,
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
 * behind DELETE /api/v1/data. Deletes every platform.* row belonging to the
 * user in FK-safe order and removes each connection's vault-held access
 * token via delete_plaid_token (an orphaned token is a live credential with
 * no owner). The auth user survives — they can relink and start fresh.
 */
export interface WipeReport {
  readonly deleted: Record<string, number>;
  /** Vault secrets removed (one per connection). */
  readonly tokensDeleted: number;
}

export async function deleteAllUserData(db: PlatformDb, userId: UserId): Promise<WipeReport> {
  // Collect vault secret ids BEFORE deleting the rows that reference them.
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
  for (const [name, table] of tables) {
    const rows = await db
      .delete(table)
      .where(eq(table.userId, userId))
      .returning({ userId: table.userId });
    deleted[name] = rows.length;
  }

  let tokensDeleted = 0;
  for (const c of connections) {
    // Best-effort: a missing secret is already the end state we want.
    try {
      await db.execute(sql`select public.delete_plaid_token(${c.secretId}::uuid)`);
      tokensDeleted++;
    } catch {
      // The row is gone either way; an undeletable secret is logged upstream.
    }
  }

  return { deleted, tokensDeleted };
}
