import type { PlatformDb } from "@platform/database";
import { sql } from "drizzle-orm";
import { platformUser } from "../env.js";

/**
 * Bridges the legacy stack: copies public.plaid_items into
 * platform.provider_connections for the platform user. Vault secret ids are
 * shared (both stacks read tokens via get_plaid_token); cursors deliberately
 * start NULL so the platform replays full history — that IS the Plaid backfill.
 */
export async function runImportConnections(db: PlatformDb): Promise<{ imported: number }> {
  const user = platformUser();
  const result = await db.execute(sql`
    insert into platform.provider_connections
      (user_id, provider, external_item_id, institution_name, access_token_secret_id, cursor, status)
    select ${user}::uuid, 'plaid', plaid_item_id, institution_name, access_token_secret_id, null, 'ok'
    from public.plaid_items
    on conflict do nothing
    returning id
  `);
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  return { imported: rows.length };
}
