import type { PlatformDb } from "@platform/database";
import { accounts, providerConnections, transactions } from "@platform/database";
import type { ConnectionId, UserId } from "@platform/financial-core";
import { connectionId, isoDate, transactionId, userId } from "@platform/financial-core";
import type {
  AccessTokenStore,
  ConnectionStore,
  ProviderConnection,
  ScribeStore,
  UncategorizedTxn,
} from "@platform/ingestion";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

export function createConnectionStore(db: PlatformDb): ConnectionStore {
  return {
    async list(user: UserId): Promise<ProviderConnection[]> {
      const rows = await db
        .select()
        .from(providerConnections)
        .where(eq(providerConnections.userId, user));
      return rows.map((r) => ({
        id: connectionId(r.id),
        userId: userId(r.userId),
        provider: r.provider,
        externalItemId: r.externalItemId,
        institutionName: r.institutionName,
        accessTokenSecretId: r.accessTokenSecretId,
        cursor: r.cursor,
        status: r.status as ProviderConnection["status"],
      }));
    },

    async update(id: ConnectionId, patch) {
      await db
        .update(providerConnections)
        .set({
          ...(patch.cursor === undefined ? {} : { cursor: patch.cursor }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.lastSyncedAt === undefined ? {} : { lastSyncedAt: patch.lastSyncedAt }),
        })
        .where(eq(providerConnections.id, id));
    },
  };
}

/**
 * Resolves Vault secret ids via the legacy get_plaid_token() RPC — the same
 * secrets the deployed edge functions use. Tokens are shared; cursors are not.
 */
export function createVaultTokenStore(db: PlatformDb): AccessTokenStore {
  return {
    async getToken(secretId: string) {
      const result = await db.execute(
        sql`select public.get_plaid_token(${secretId}::uuid) as token`,
      );
      const rows = (
        Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
      ) as Array<{
        token: string | null;
      }>;
      const token = rows[0]?.token;
      if (token == null || token === "") {
        throw new Error(`vault: no token for secret ${secretId}`);
      }
      return token;
    },
  };
}

export function createScribeStore(db: PlatformDb): ScribeStore {
  return {
    async listUncategorized(user, since, limit) {
      const rows = await db
        .select({
          id: transactions.id,
          source: transactions.source,
          description: transactions.description,
          merchant: transactions.merchant,
          amountMinor: transactions.amountMinor,
          sourceCategory: transactions.sourceCategory,
          postedAt: transactions.postedAt,
          accountKind: accounts.kind,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            eq(transactions.userId, user),
            eq(transactions.category, "other"),
            ne(transactions.categorySource, "user"),
            gte(transactions.postedAt, since),
          ),
        )
        .orderBy(desc(transactions.postedAt))
        .limit(limit);
      return rows.map((r) => ({
        id: transactionId(r.id),
        source: r.source as UncategorizedTxn["source"],
        description: r.description,
        merchant: r.merchant,
        amountMinor: r.amountMinor,
        accountKind: r.accountKind as UncategorizedTxn["accountKind"],
        sourceCategory: r.sourceCategory,
        postedAt: isoDate(r.postedAt),
      }));
    },

    async applyCategory(user, ids, category) {
      if (ids.length === 0) return 0;
      const rows = await db
        .update(transactions)
        .set({ category, categorySource: "ai" })
        .where(
          and(
            eq(transactions.userId, user),
            inArray(transactions.id, [...ids]),
            // A correction that landed since the listing is still law.
            ne(transactions.categorySource, "user"),
          ),
        )
        .returning({ id: transactions.id });
      return rows.length;
    },
  };
}
