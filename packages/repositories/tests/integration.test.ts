import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PlatformDb } from "@platform/database";
import { budgets as budgetsTable, goals as goalsTable, schema } from "@platform/database";
import type { NewTransaction } from "@platform/financial-core";
import { accountId, isoDate, money, userId } from "@platform/financial-core";
import { computeMetrics, defaultEngineConfig, deriveEvents } from "@platform/insight-engine";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAccountRepository,
  createBudgetRepository,
  createEventStore,
  createGoalRepository,
  createMetricSnapshotStore,
  createSnapshotRepository,
  createTransactionRepository,
  loadFinancialState,
} from "../src/index.js";

const USER = userId("00000000-0000-0000-0000-000000000001");
const OTHER_USER = userId("00000000-0000-0000-0000-000000000002");

let client: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  client = new PGlite();
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../database/migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sqlText = readFileSync(join(migrationsDir, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      await client.exec(statement);
    }
  }
  db = drizzle(client, { schema }) as unknown as PlatformDb;
});

afterAll(async () => {
  await client.close();
});

describe("AccountRepository", () => {
  it("upserts by (user, source, externalId) — stable platform id, updated balance", async () => {
    const repo = createAccountRepository(db);
    const first = await repo.upsertByExternalId(USER, {
      userId: USER,
      source: "plaid",
      externalId: "plaid-acct-1",
      name: "Checking",
      institution: "Test Bank",
      kind: "depository",
      balance: money(100_000),
      isActive: true,
    });
    const second = await repo.upsertByExternalId(USER, {
      userId: USER,
      source: "plaid",
      externalId: "plaid-acct-1",
      name: "Checking",
      institution: "Test Bank",
      kind: "depository",
      balance: money(250_000),
      isActive: true,
    });
    expect(second.id).toBe(first.id);
    expect(second.balance).toEqual(money(250_000));
    expect(await repo.listActive(USER)).toHaveLength(1);
    expect(await repo.listActive(OTHER_USER)).toHaveLength(0);
  });
});

describe("TransactionRepository", () => {
  it("upserts on (user, source, sourceTxnId), filters by range, deletes by source ids", async () => {
    const accountRepo = createAccountRepository(db);
    const account = await accountRepo.upsertByExternalId(USER, {
      userId: USER,
      source: "plaid",
      externalId: "plaid-acct-txns",
      name: "Card",
      institution: "Test Bank",
      kind: "credit",
      balance: money(50_000),
      isActive: true,
    });

    const repo = createTransactionRepository(db);
    const base: Omit<NewTransaction, "sourceTxnId" | "postedAt" | "amount"> = {
      userId: USER,
      accountId: account.id,
      source: "plaid",
      description: "coffee",
      merchant: "Blue Bottle",
      pending: false,
      category: "coffee",
    };
    await repo.upsertMany(USER, [
      { ...base, sourceTxnId: "t1", postedAt: isoDate("2026-08-01"), amount: money(-6_50) },
      { ...base, sourceTxnId: "t2", postedAt: isoDate("2026-08-05"), amount: money(-7_25) },
    ]);
    // Re-upsert t1 with a changed amount (Plaid "modified")
    await repo.upsertMany(USER, [
      { ...base, sourceTxnId: "t1", postedAt: isoDate("2026-08-01"), amount: money(-9_99) },
    ]);

    const all = await repo.findByUser(USER);
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.sourceTxnId === "t1")?.amount).toEqual(money(-9_99));

    const ranged = await repo.findByUser(USER, {
      from: isoDate("2026-08-02"),
      to: isoDate("2026-08-31"),
    });
    expect(ranged.map((t) => t.sourceTxnId)).toEqual(["t2"]);

    expect(await repo.deleteBySourceIds(USER, "plaid", ["t2", "missing"])).toBe(1);
    expect(await repo.findByUser(USER)).toHaveLength(1);
  });
});

describe("SnapshotRepository", () => {
  it("upserts and finds latest on or before a date", async () => {
    const accountRepo = createAccountRepository(db);
    const account = await accountRepo.upsertByExternalId(USER, {
      userId: USER,
      source: "plaid",
      externalId: "plaid-acct-snap",
      name: "Loan",
      institution: "Test Bank",
      kind: "loan",
      balance: money(1_000_000),
      isActive: true,
    });

    const repo = createSnapshotRepository(db);
    await repo.upsert(USER, {
      userId: USER,
      accountId: account.id,
      asOf: isoDate("2026-07-01"),
      balance: money(1_100_000),
    });
    await repo.upsert(USER, {
      userId: USER,
      accountId: account.id,
      asOf: isoDate("2026-07-15"),
      balance: money(1_050_000),
    });
    // Same-key upsert overwrites
    await repo.upsert(USER, {
      userId: USER,
      accountId: account.id,
      asOf: isoDate("2026-07-15"),
      balance: money(1_049_000),
    });

    const found = await repo.latestOnOrBefore(USER, account.id, isoDate("2026-07-20"));
    expect(found?.asOf).toBe("2026-07-15");
    expect(found?.balance).toEqual(money(1_049_000));
    expect(await repo.latestOnOrBefore(USER, account.id, isoDate("2026-06-30"))).toBeNull();
    expect((await repo.listByUser(USER)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Goal + Budget repositories", () => {
  it("maps rows to domain unions and skips invalid rows", async () => {
    await db.insert(goalsTable).values([
      {
        userId: USER,
        kind: "savings_net_flow",
        targetAmountMinor: 500_000,
        targetDate: "2026-12-31",
        startedAt: "2026-08-01",
        baselineAmountMinor: 0,
      },
      // balance_target without an account id: invalid, must be skipped
      { userId: USER, kind: "balance_target", targetAmountMinor: 1 },
    ]);
    const goals = await createGoalRepository(db).listActive(USER);
    expect(goals).toHaveLength(1);
    expect(goals[0]?.kind).toBe("savings_net_flow");

    await db.insert(budgetsTable).values([
      { userId: USER, category: "delivery", monthlyCapMinor: 200_00 },
      { userId: USER, category: "not_a_category", monthlyCapMinor: 1_00 },
    ]);
    const budgets = await createBudgetRepository(db).listActive(USER);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.category).toBe("delivery");
  });
});

describe("end-to-end: state -> engine -> stores", () => {
  it("loads state, computes metrics, persists snapshot + events, reads them back", async () => {
    const state = await loadFinancialState(db, USER);
    expect(state.accounts.length).toBeGreaterThan(0);
    expect(state.transactions.length).toBeGreaterThan(0);

    const asOf = isoDate("2026-08-15");
    const metricSet = computeMetrics(state, defaultEngineConfig, asOf);
    expect(metricSet.userId).toBe(USER);

    const metricStore = createMetricSnapshotStore(db);
    await metricStore.save(metricSet);
    await metricStore.save(metricSet); // idempotent same-day save
    const restored = await metricStore.latest(USER);
    expect(restored).toEqual(metricSet);

    // First evaluation announces the (off-track) savings goal.
    const events = deriveEvents(null, metricSet, defaultEngineConfig);
    expect(events.length).toBeGreaterThan(0);

    const eventStore = createEventStore(db);
    await eventStore.insertMany(events);
    const recent = await eventStore.listRecent(USER, 10);
    expect(recent).toHaveLength(events.length);
    expect(recent.map((s) => s.event.type).sort()).toEqual(events.map((e) => e.type).sort());
    // createdAt is a real ISO timestamp — the cursor clients advance on.
    expect(Number.isNaN(Date.parse(recent[0]?.createdAt ?? ""))).toBe(false);

    // listSince: strictly-after filtering on createdAt.
    const all = await eventStore.listSince(USER, new Date(0), 10);
    expect(all).toHaveLength(events.length);
    const afterAll = await eventStore.listSince(
      USER,
      new Date(
        recent
          .map((s) => Date.parse(s.createdAt))
          .sort()
          .at(-1) ?? 0,
      ),
      10,
    );
    expect(afterAll).toHaveLength(0);

    // listRange: the snapshot timeline, ascending and user-scoped.
    const secondDay = { ...metricSet, asOf: isoDate("2026-08-16") };
    await metricStore.save(secondDay);
    const range = await metricStore.listRange(USER, isoDate("2026-08-15"), isoDate("2026-08-16"));
    expect(range.map((m) => m.asOf)).toEqual(["2026-08-15", "2026-08-16"]);
    const narrow = await metricStore.listRange(USER, isoDate("2026-08-16"), isoDate("2026-08-16"));
    expect(narrow.map((m) => m.asOf)).toEqual(["2026-08-16"]);
    expect(
      await metricStore.listRange(OTHER_USER, isoDate("2026-08-01"), isoDate("2026-08-31")),
    ).toEqual([]);

    // Round-tripped snapshot diffs cleanly: no phantom events.
    expect(deriveEvents(restored, metricSet, defaultEngineConfig)).toEqual([]);
  });
});
