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
  createInvestmentActivityRepository,
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
let db: PlatformDb;

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
  db = drizzle(client, { schema }) as unknown as PlatformDb;

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
      categorySource: "rule",
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
      categorySource: "rule",
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

  await createInvestmentActivityRepository(db).upsertMany(USER, [
    {
      userId: USER,
      accountId: account.id,
      source: "plaid",
      sourceActivityId: "ivt-1",
      date: isoDate("2026-08-01"),
      description: "EMPLOYEE CONTRIBUTION",
      kind: "contribution",
      amount: money(65_000),
    },
    {
      userId: USER,
      accountId: account.id,
      source: "plaid",
      sourceActivityId: "ivt-2",
      date: isoDate("2026-07-20"),
      description: "VTSAX DIVIDEND",
      kind: "dividend",
      amount: money(4_200),
      ticker: "VTSAX",
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

  it("GET /api/v1/events returns typed envelopes with a createdAt cursor", async () => {
    const res = await get("/api/v1/events", GOOD_TOKEN);
    const [event] = res.json();
    expect(event.type).toBe("NET_CASH_FLOW_POSITIVE");
    expect(event.occurredOn).toBe("2026-08-01");
    expect(Number.isNaN(Date.parse(event.createdAt))).toBe(false);
    expect(event.payload.netFlow).toEqual({ amountMinor: 100_000, currency: "USD" });
  });

  it("GET /api/v1/events?since= filters strictly after the cursor", async () => {
    const [event] = (await get("/api/v1/events", GOOD_TOKEN)).json();
    const before = new Date(Date.parse(event.createdAt) - 60_000).toISOString();
    const after = new Date(Date.parse(event.createdAt) + 60_000).toISOString();
    expect(
      (await get(`/api/v1/events?since=${encodeURIComponent(before)}`, GOOD_TOKEN)).json(),
    ).toHaveLength(1);
    expect(
      (await get(`/api/v1/events?since=${encodeURIComponent(after)}`, GOOD_TOKEN)).json(),
    ).toHaveLength(0);
    expect((await get("/api/v1/events?since=not-a-date", GOOD_TOKEN)).statusCode).toBe(400);
  });

  it("GET /api/v1/insights is null before any snapshot exists", async () => {
    const res = await get("/api/v1/insights", GOOD_TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.body === "null" || res.body === "").toBe(true);
  });

  it("GET /api/v1/insights/history returns the snapshot timeline", async () => {
    // Empty before any snapshots exist.
    expect((await get("/api/v1/insights/history?from=2026-08-01", GOOD_TOKEN)).json()).toEqual([]);
    // Range guard: >180 days is rejected.
    expect(
      (await get("/api/v1/insights/history?from=2020-01-01&to=2026-01-01", GOOD_TOKEN)).statusCode,
    ).toBe(400);
    expect(
      (await get("/api/v1/insights/history?from=2026-08-31&to=2026-08-01", GOOD_TOKEN)).statusCode,
    ).toBe(400);
  });

  it("GET /api/v1/investments/activity returns activity with range filtering", async () => {
    const all = (await get("/api/v1/investments/activity", GOOD_TOKEN)).json();
    expect(all).toHaveLength(2);
    expect(all[0].userId).toBeUndefined(); // serializer strips internals

    const ranged = (await get("/api/v1/investments/activity?from=2026-08-01", GOOD_TOKEN)).json();
    expect(ranged).toHaveLength(1);
    expect(ranged[0]).toMatchObject({
      kind: "contribution",
      amount: { amountMinor: 65_000, currency: "USD" },
    });
    expect((await get("/api/v1/investments/activity")).statusCode).toBe(401);
  });

  it("GET /api/v1/goals returns the empty list", async () => {
    expect((await get("/api/v1/goals", GOOD_TOKEN)).json()).toEqual([]);
  });
});

describe("product state", () => {
  const send = (method: "PUT", url: string, payload: unknown, token?: string) =>
    app.inject({
      method,
      url,
      payload: payload as Record<string, unknown>,
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  it("requires auth and rejects unknown products", async () => {
    expect((await get("/api/v1/products/kingdom/state")).statusCode).toBe(401);
    expect((await get("/api/v1/products/nonsense/state", GOOD_TOKEN)).statusCode).toBe(400);
  });

  it("404s before any write, then round-trips with CAS semantics", async () => {
    expect((await get("/api/v1/products/kingdom/state", GOOD_TOKEN)).statusCode).toBe(404);

    const first = await send(
      "PUT",
      "/api/v1/products/kingdom/state",
      {
        data: { lastSeenAt: "2026-08-04T00:00:00Z" },
      },
      GOOD_TOKEN,
    );
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ version: 1 });

    const read = await get("/api/v1/products/kingdom/state", GOOD_TOKEN);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({
      product: "kingdom",
      version: 1,
      data: { lastSeenAt: "2026-08-04T00:00:00Z" },
    });

    const cas = await send(
      "PUT",
      "/api/v1/products/kingdom/state",
      {
        data: { lastSeenAt: "2026-08-05T00:00:00Z" },
        baseVersion: 1,
      },
      GOOD_TOKEN,
    );
    expect(cas.statusCode).toBe(200);
    expect(cas.json()).toEqual({ version: 2 });

    const stale = await send(
      "PUT",
      "/api/v1/products/kingdom/state",
      {
        data: { lastSeenAt: "stale" },
        baseVersion: 1,
      },
      GOOD_TOKEN,
    );
    expect(stale.statusCode).toBe(409);
  });

  it("rejects oversized state payloads", async () => {
    const res = await send(
      "PUT",
      "/api/v1/products/kingdom/state",
      {
        data: { blob: "x".repeat(65 * 1024) },
      },
      GOOD_TOKEN,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("transaction category override", () => {
  const patch = (url: string, payload: unknown, token?: string) =>
    app.inject({
      method: "PATCH",
      url,
      payload: payload as Record<string, unknown>,
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  it("sets the category as law and learns a standing rule", async () => {
    const txns = (await get("/api/v1/transactions", GOOD_TOKEN)).json();
    const target = txns[0];
    expect(target.categorySource).toBe("rule"); // exposed since the provenance column

    const res = await patch(
      `/api/v1/transactions/${target.id}`,
      { category: "transfer" },
      GOOD_TOKEN,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: target.id,
      category: "transfer",
      categorySource: "user",
    });

    // The correction persisted a per-user standing rule.
    const { userCategoryRules } = schema;
    const rules = await db.select().from(userCategoryRules);
    expect(rules.some((r) => r.origin === "user" && r.category === "transfer")).toBe(true);
  });

  it("rejects bad categories, unknown ids, and other users' transactions", async () => {
    const txns = (await get("/api/v1/transactions", GOOD_TOKEN)).json();
    expect(
      (await patch(`/api/v1/transactions/${txns[0].id}`, { category: "nonsense" }, GOOD_TOKEN))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await patch(
          "/api/v1/transactions/00000000-0000-0000-0000-00000000dead",
          { category: "dining" },
          GOOD_TOKEN,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await patch(`/api/v1/transactions/${txns[0].id}`, { category: "dining" })).statusCode,
    ).toBe(401);
  });
});

describe("account liabilities on GET /accounts", () => {
  it("merges bank-reported APR facts and never leaks across users", async () => {
    const accounts = (await get("/api/v1/accounts", GOOD_TOKEN)).json();
    const target = accounts[0];
    expect(target.apr).toBeUndefined(); // nothing seeded yet

    const { accountLiabilities } = schema;
    await db.insert(accountLiabilities).values({
      accountId: target.id,
      userId: USER,
      kind: "credit",
      aprBps: 2999,
      aprType: "purchase_apr",
      minPaymentMinor: 40_00,
      nextDueDate: "2026-08-27",
      isOverdue: false,
    });

    const after = (await get("/api/v1/accounts", GOOD_TOKEN)).json();
    const enriched = after.find((a: { id: string }) => a.id === target.id);
    expect(enriched).toMatchObject({
      apr: 29.99,
      aprType: "purchase_apr",
      minPayment: { amountMinor: 40_00 },
      nextDueDate: "2026-08-27",
      isOverdue: false,
    });
    expect(enriched.userId).toBeUndefined(); // serializer still strips internals
  });
});
