// Plaid webhooks (roadmap Phase E): fresh data without waiting for the daily
// worker. Every request is verified against Plaid's signing key (ES256 JWT in
// the Plaid-Verification header whose payload names the body's SHA-256) —
// an unverified webhook is an unauthenticated write trigger and gets a 401.
//
// Routing (all idempotent — Phase 0 made derivation safe to repeat):
// - TRANSACTIONS / SYNC_UPDATES_AVAILABLE  -> targeted single-connection sync
// - LIABILITIES / HOLDINGS / INVESTMENTS_* -> same (new APRs, contributions)
// - ITEM errors and pending expiry         -> status flip, so the Counting
//   House shows "renew the oath" immediately instead of after tonight's run
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { PlatformDb } from "@platform/database";
import type { PlaidConfig, PlaidHttp } from "@platform/ingestion";
import { createPlaidClient } from "@platform/ingestion";
import { createConnectionStore, findConnectionByExternalItemId } from "@platform/repositories";
import type { UserSync } from "./sync.js";

export interface PlaidWebhook {
  verify(verificationJwt: string | undefined, rawBody: Buffer): Promise<boolean>;
  handle(body: Record<string, unknown>): Promise<{ handled: string }>;
}

const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JWT_AGE_S = 5 * 60;

const b64url = (s: string): Buffer => Buffer.from(s, "base64url");

export function createPlaidWebhook(
  db: PlatformDb,
  plaid: PlaidConfig,
  sync: UserSync | undefined,
  http: PlaidHttp = createPlaidClient(plaid),
  now: () => number = Date.now,
): PlaidWebhook {
  // Plaid rotates signing keys rarely; cache by kid with a daily refetch.
  const keys = new Map<string, { jwk: Record<string, unknown>; fetchedAt: number }>();

  async function keyFor(kid: string): Promise<Record<string, unknown> | null> {
    const cached = keys.get(kid);
    if (cached !== undefined && now() - cached.fetchedAt < KEY_TTL_MS) return cached.jwk;
    try {
      const resp = await http.post("/webhook_verification_key/get", { key_id: kid });
      const jwk = resp.key as Record<string, unknown> | undefined;
      if (jwk === undefined) return null;
      keys.set(kid, { jwk, fetchedAt: now() });
      return jwk;
    } catch {
      return null;
    }
  }

  return {
    async verify(verificationJwt, rawBody) {
      if (verificationJwt === undefined) return false;
      const parts = verificationJwt.split(".");
      if (parts.length !== 3) return false;
      const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
      let header: { alg?: string; kid?: string };
      let payload: { iat?: number; request_body_sha256?: string };
      try {
        header = JSON.parse(b64url(headerB64).toString("utf8"));
        payload = JSON.parse(b64url(payloadB64).toString("utf8"));
      } catch {
        return false;
      }
      if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

      const jwk = await keyFor(header.kid);
      if (jwk === null) return false;
      let valid: boolean;
      try {
        const key = createPublicKey({ key: jwk as never, format: "jwk" });
        valid = verify(
          "sha256",
          Buffer.from(`${headerB64}.${payloadB64}`),
          { key, dsaEncoding: "ieee-p1363" },
          b64url(signatureB64),
        );
      } catch {
        return false;
      }
      if (!valid) return false;

      if (typeof payload.iat !== "number" || now() / 1000 - payload.iat > MAX_JWT_AGE_S) {
        return false;
      }
      const expected = Buffer.from(String(payload.request_body_sha256 ?? ""), "utf8");
      const actual = Buffer.from(createHash("sha256").update(rawBody).digest("hex"), "utf8");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },

    async handle(body) {
      const itemId = typeof body.item_id === "string" ? body.item_id : null;
      const type = String(body.webhook_type ?? "");
      const code = String(body.webhook_code ?? "");
      if (itemId === null) return { handled: "ignored" };

      const connection = await findConnectionByExternalItemId(db, itemId);
      if (connection === null) return { handled: "unknown_item" };

      if (type === "ITEM") {
        const error = body.error as { error_code?: string } | null | undefined;
        if (
          (code === "ERROR" && error?.error_code === "ITEM_LOGIN_REQUIRED") ||
          code === "PENDING_EXPIRATION" ||
          code === "PENDING_DISCONNECT"
        ) {
          await createConnectionStore(db).update(connection.id, { status: "login_required" });
          return { handled: "login_required" };
        }
        if (code === "USER_PERMISSION_REVOKED") {
          await createConnectionStore(db).update(connection.id, { status: "error" });
          return { handled: "revoked" };
        }
        return { handled: "ignored" };
      }

      const wantsSync =
        (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") ||
        type === "LIABILITIES" ||
        type === "HOLDINGS" ||
        type === "INVESTMENTS_TRANSACTIONS";
      if (wantsSync && sync !== undefined) {
        await sync(connection.userId, { connectionId: connection.id });
        return { handled: "synced" };
      }
      return { handled: "ignored" };
    },
  };
}
