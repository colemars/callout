import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { AuthError, type JwtVerifier } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import { providerConnections, schema } from "@platform/database";
import { money, userId } from "@platform/financial-core";
import { createAccountRepository, createTransactionRepository } from "@platform/repositories";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const USER = userId("00000000-0000-0000-0000-00000000aaaa");
const OTHER = userId("00000000-0000-0000-0000-00000000bbbb");
const TOKEN = "good-token";

const verifier: JwtVerifier = {
  async verify(token) {
    if (token !== TOKEN) throw new AuthError("bad token");
    return { userId: USER, email: "test@example.com" };
  },
};

let app: FastifyInstance;
let db: PlatformDb;
const revoked: string[] = [];

async function seedUser(user: typeof USER, ext: string) {
  const account = await createAccountRepository(db).upsertByExternalId(user, {
    userId: user,
    source: "plaid",
    externalId: ext,
    name: "Checking",
    institution: "Tartan Bank",
    kind: "depository",
    balance: money(50_000),
    isActive: true,
  });
  await createTransactionRepository(db).upsertMany(user, [
    {
      userId: user,
      accountId: account.id,
      source: "plaid",
      sourceTxnId: `t-${ext}`,
      postedAt: "2026-08-01",
      description: "COFFEE",
      merchant: "COFFEE",
      amount: money(-4_50),
      pending: false,
      category: "coffee",
      categorySource: "rule",
    } as never,
  ]);
  await db.insert(providerConnections).values({
    userId: user,
    provider: "plaid",
    externalItemId: `item-${ext}`,
    institutionName: "Tartan Bank",
    accessTokenSecretId: `00000000-0000-0000-0000-0000000000${ext.length}${ext.length}`,
    status: "ok",
  });
}

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
  await seedUser(USER, "mine");
  await seedUser(OTHER, "theirs");

  app = await buildApp({
    db,
    verifier,
    logger: false,
    revokePlaidItem: async (secretId) => {
      revoked.push(secretId);
    },
  });
});

afterAll(async () => {
  await app.close();
});

const auth = { authorization: `Bearer ${TOKEN}` };

describe("GET /api/v1/export", () => {
  it("returns the caller's archive and never leaks secret ids or user ids", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/export", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accounts).toHaveLength(1);
    expect(body.transactions).toHaveLength(1);
    expect(body.connections).toEqual([{ institution: "Tartan Bank", status: "ok" }]);
    const raw = res.body;
    expect(raw).not.toContain("accessTokenSecretId");
    expect(raw).not.toContain("access_token_secret_id");
    expect(raw).not.toContain(USER); // user ids stripped by the serializer
  });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/export" });
    expect(res.statusCode).toBe(401);
  });
});

describe("DELETE /api/v1/data", () => {
  it("refuses without the exact confirmation phrase", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/data",
      headers: auth,
      payload: { confirm: "burn the ledgers" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("wipes only the caller's rows; Plaid revoke stays opt-in", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/data",
      headers: auth,
      payload: { confirm: "BURN THE LEDGERS" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deleted.accounts).toBe(1);
    expect(body.deleted.transactions).toBe(1);
    expect(body.deleted.provider_connections).toBe(1);
    expect(body.revokedAtPlaid).toBe(0);
    expect(revoked).toEqual([]); // opt-in only — never called by default

    // The other user's world is untouched.
    const rows = await db.select().from(providerConnections);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(OTHER);

    // And the caller's export is now empty.
    const after = await app.inject({ method: "GET", url: "/api/v1/export", headers: auth });
    expect(after.json().accounts).toEqual([]);
  });

  it("opt-in revoke calls Plaid per connection", async () => {
    await seedUser(USER, "again");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/data",
      headers: auth,
      payload: { confirm: "BURN THE LEDGERS", alsoRevokeAtPlaid: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revokedAtPlaid).toBe(1);
    expect(revoked).toHaveLength(1);
  });
});
