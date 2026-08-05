import type { PlatformDb } from "@platform/database";
import { providerConnections } from "@platform/database";
import { PlaidError, createPlaidClient } from "@platform/ingestion";
import { createVaultTokenStore } from "@platform/repositories";
import { eq } from "drizzle-orm";
import { requireEnv } from "../env.js";

// Not a secret — the public webhook endpoint of the platform API (bake-config-in).
export const PLAID_WEBHOOK_URL =
  "https://ohf5w7ank0.execute-api.us-west-2.amazonaws.com/webhooks/plaid";

export interface WebhookUpdateReport {
  readonly institution: string;
  readonly status: "ok" | "error";
  readonly message?: string;
}

/**
 * Backfill: point every existing Plaid item at the platform's webhook
 * endpoint (/item/webhook/update). New items get the URL at link-token time;
 * this covers everything linked before webhooks existed. Idempotent — safe to
 * re-run whenever the URL changes. Per-item failures (e.g. dead sandbox
 * items) report and continue.
 */
export async function runUpdateWebhooks(db: PlatformDb): Promise<WebhookUpdateReport[]> {
  const client = createPlaidClient({
    clientId: requireEnv("PLAID_CLIENT_ID"),
    secret: requireEnv("PLAID_SECRET"),
    env: process.env.PLAID_ENV === "production" ? "production" : "sandbox",
  });
  const tokens = createVaultTokenStore(db);
  const rows = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.provider, "plaid"));

  const reports: WebhookUpdateReport[] = [];
  for (const row of rows) {
    const institution = row.institutionName ?? row.externalItemId;
    try {
      const accessToken = await tokens.getToken(row.accessTokenSecretId);
      await client.post("/item/webhook/update", {
        access_token: accessToken,
        webhook: PLAID_WEBHOOK_URL,
      });
      reports.push({ institution, status: "ok" });
    } catch (error) {
      reports.push({
        institution,
        status: "error",
        message: error instanceof PlaidError ? error.code : String(error),
      });
    }
  }
  return reports;
}
