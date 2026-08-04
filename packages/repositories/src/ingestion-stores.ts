import type { PlatformDb } from "@platform/database";
import { providerConnections } from "@platform/database";
import type { ConnectionId, UserId } from "@platform/financial-core";
import { connectionId, userId } from "@platform/financial-core";
import type { AccessTokenStore, ConnectionStore, ProviderConnection } from "@platform/ingestion";
import { eq, sql } from "drizzle-orm";

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
