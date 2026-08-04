import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { AuthError, type JwtVerifier } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import { budgets, schema } from "@platform/database";
import { isoDate, money, userId } from "@platform/financial-core";
import {
  createAccountRepository,
  createEventStore,
  createTransactionRepository,
} from "@platform/repositories";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const USER = userId("00000000-0000-0000-0000-00000000aaaa");
const GOOD_TOKEN = "good-token";

const fakeVerifier: JwtVerifier = {
  async verify(token) {
    if (token !== GOOD_TOKEN) throw new AuthError("bad token");
    return { userId: USER, email: "cole@colemars.dev" };
  },
};

let client: PGlite;
let app: FastifyInstance;

beforeAll(async () => {
  client = new PGlite();
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
  const db = drizzle(client, { schema }) as unknown as PlatformDb;

  // Seed: one account, two transactions, one budget, one event.
  const account = await createAccountRepository(db).upsertByExternalId(USER, {
    userId: USER,
    source: "plaid",
    externalId: "ext-1",
    name: "Checking",
    institution: "Tartan Bank",
    kind: "depository",
    balance: money(123_456),
    isActive: true,
  });
  await createTransactionRepository(db).upsertMany(USER, [
    {
      userId: USER,
      accountId: account.id,
      source: "plaid",
      sourceTxnId: "t1",
      postedAt: isoDate("2026-08-01"),
      description: "STARBUCKS",
      merchant: "Starbucks",
      amount: money(-6_33),
      pending: false,
      category: "coffee",
    },
    {
      userId: USER,
      accountId: account.id,
      source: "plaid",
      sourceTxnId: "t2",
      postedAt: isoDate("2026-07-15"),
      description: "PAYROLL",
      amount: money(250_000),
      pending: false,
      category: "income",
    },
  ]);
  await db.insert(budgets).values({ userId: USER, category: "coffee", monthlyCapMinor: 80_00 });
  await createEventStore(db).insertMany([
    {
      userId: USER,
      occurredOn: isoDate("2026-08-01"),
      type: "NET_CASH_FLOW_POSITIVE",
      month: "2026-07" as never,
      netFlow: money(100_000),
    },
  ]);

  app = await buildApp({ db, verifier: fakeVerifier, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await client.close();
});

const get = (url: string, token?: string) =>
  app.inject({
    method: "GET",
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

describe("auth", () => {
  it("health is public", async () => {
    const res = await get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("v1 routes reject missing and bad tokens", async () => {
    for (const url of ["/api/v1/accounts", "/api/v1/transactions", "/api/v1/events"]) {
      expect((await get(url)).statusCode).toBe(401);
      expect((await get(url, "wrong")).statusCode).toBe(401);
    }
  });
});

describe("routes", () => {
  it("GET /api/v1/accounts returns accounts without leaking internals", async () => {
    const res = await get("/api/v1/accounts", GOOD_TOKEN);
    expect(res.statusCode).toBe(200);
    const [account] = res.json();
    expect(account).toMatchObject({
      name: "Checking",
      institution: "Tartan Bank",
      kind: "depository",
      balance: { amountMinor: 123_456, currency: "USD" },
      isActive: true,
    });
    // The serializer strips everything not in the schema:
    expect(account.userId).toBeUndefined();
    expect(account.externalId).toBeUndefined();
    expect(account.connectionId).toBeUndefined();
  });

  it("GET /api/v1/transactions filters by date range", async () => {
    const all = await get("/api/v1/transactions", GOOD_TOKEN);
    expect(all.json()).toHaveLength(2);

    const ranged = await get("/api/v1/transactions?from=2026-08-01", GOOD_TOKEN);
    const txns = ranged.json();
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({
      description: "STARBUCKS",
      amount: { amountMinor: -6_33, currency: "USD" },
      category: "coffee",
    });
    expect(txns[0].userId).toBeUndefined();
  });

  it("rejects malformed query params", async () => {
    expect((await get("/api/v1/transactions?from=08/01/2026", GOOD_TOKEN)).statusCode).toBe(400);
    expect((await get("/api/v1/events?limit=0", GOOD_TOKEN)).statusCode).toBe(400);
  });

  it("GET /api/v1/budgets returns budgets", async () => {
    const res = await get("/api/v1/budgets", GOOD_TOKEN);
    expect(res.json()).toEqual([
      { category: "coffee", monthlyCap: { amountMinor: 80_00, currency: "USD" }, active: true },
    ]);
  });

  it("GET /api/v1/events returns typed envelopes", async () => {
    const res = await get("/api/v1/events", GOOD_TOKEN);
    const [event] = res.json();
    expect(event.type).toBe("NET_CASH_FLOW_POSITIVE");
    expect(event.occurredOn).toBe("2026-08-01");
    expect(event.payload.netFlow).toEqual({ amountMinor: 100_000, currency: "USD" });
  });

  it("GET /api/v1/insights is null before any snapshot exists", async () => {
    const res = await get("/api/v1/insights", GOOD_TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.body === "null" || res.body === "").toBe(true);
  });

  it("GET /api/v1/goals returns the empty list", async () => {
    expect((await get("/api/v1/goals", GOOD_TOKEN)).json()).toEqual([]);
  });
});
