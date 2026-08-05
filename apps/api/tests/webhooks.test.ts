import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PlatformDb } from "@platform/database";
import { providerConnections, schema } from "@platform/database";
import type { PlaidHttp } from "@platform/ingestion";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import type { UserSync } from "../src/sync.js";
import { createPlaidWebhook } from "../src/webhooks.js";

const USER = "00000000-0000-0000-0000-00000000bbbb";
const ITEM = "item-webhook-test";
const PLAID = { clientId: "cid", secret: "sec", env: "sandbox" as const };

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = publicKey.export({ format: "jwk" });

const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

/** A Plaid-style verification JWT over the given body, signed by our test key. */
function signJwt(rawBody: Buffer, overrides?: { alg?: string; iat?: number }): string {
  const header = b64url(JSON.stringify({ alg: overrides?.alg ?? "ES256", kid: "k1", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iat: overrides?.iat ?? Math.floor(Date.now() / 1000),
      request_body_sha256: createHash("sha256").update(rawBody).digest("hex"),
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

const fakeHttp: PlaidHttp = {
  async post(path) {
    if (path === "/webhook_verification_key/get") return { key: jwk as Record<string, unknown> };
    throw new Error(`unexpected plaid call: ${path}`);
  },
};

let db: PlatformDb;
let connectionId: string;

beforeAll(async () => {
  const client = new PGlite();
  const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/database/migrations",
  );
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(join(migrationsDir, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      await client.exec(statement);
    }
  }
  db = drizzle(client, { schema }) as unknown as PlatformDb;
  const rows = await db
    .insert(providerConnections)
    .values({
      userId: USER,
      provider: "plaid",
      externalItemId: ITEM,
      institutionName: "Tartan Bank",
      accessTokenSecretId: "00000000-0000-0000-0000-00000000cccc",
      status: "ok",
    })
    .returning({ id: providerConnections.id });
  connectionId = rows[0]?.id as string;
});

describe("webhook verification", () => {
  const webhook = () => createPlaidWebhook(db, PLAID, undefined, fakeHttp);
  const body = Buffer.from(JSON.stringify({ webhook_type: "TRANSACTIONS" }));

  it("accepts a correctly signed JWT over the exact bytes", async () => {
    expect(await webhook().verify(signJwt(body), body)).toBe(true);
  });

  it("rejects a signature over different bytes", async () => {
    const other = Buffer.from(JSON.stringify({ webhook_type: "TAMPERED" }));
    expect(await webhook().verify(signJwt(other), body)).toBe(false);
  });

  it("rejects wrong algorithms, stale tokens, and garbage", async () => {
    expect(await webhook().verify(signJwt(body, { alg: "HS256" }), body)).toBe(false);
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(await webhook().verify(signJwt(body, { iat: stale }), body)).toBe(false);
    expect(await webhook().verify("not.a.jwt", body)).toBe(false);
    expect(await webhook().verify(undefined, body)).toBe(false);
  });
});

describe("webhook handling", () => {
  it("SYNC_UPDATES_AVAILABLE triggers a targeted single-connection sync", async () => {
    const calls: Array<{ userId: string; connectionId?: string }> = [];
    const sync: UserSync = async (userId, opts) => {
      calls.push({
        userId: userId as string,
        ...(opts?.connectionId === undefined ? {} : { connectionId: opts.connectionId }),
      });
      return { reports: [], newEvents: 0 };
    };
    const webhook = createPlaidWebhook(db, PLAID, sync, fakeHttp);
    const result = await webhook.handle({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: ITEM,
    });
    expect(result).toEqual({ handled: "synced" });
    expect(calls).toEqual([{ userId: USER, connectionId }]);
  });

  it("ITEM_LOGIN_REQUIRED flips the connection status immediately", async () => {
    const webhook = createPlaidWebhook(db, PLAID, undefined, fakeHttp);
    const result = await webhook.handle({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: ITEM,
      error: { error_code: "ITEM_LOGIN_REQUIRED" },
    });
    expect(result).toEqual({ handled: "login_required" });
    const rows = await db.select().from(providerConnections);
    expect(rows.find((r) => r.externalItemId === ITEM)?.status).toBe("login_required");
  });

  it("unknown items and unrouted codes are acknowledged, never errors", async () => {
    const webhook = createPlaidWebhook(db, PLAID, undefined, fakeHttp);
    expect(await webhook.handle({ webhook_type: "TRANSACTIONS", item_id: "nope" })).toEqual({
      handled: "unknown_item",
    });
    expect(await webhook.handle({ webhook_type: "TRANSACTIONS" })).toEqual({ handled: "ignored" });
    expect(
      await webhook.handle({ webhook_type: "ITEM", webhook_code: "NEW_STATE", item_id: ITEM }),
    ).toEqual({ handled: "ignored" });
  });
});
