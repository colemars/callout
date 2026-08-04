import type {
  Account,
  AccountRepository,
  BalanceSnapshot,
  NewTransaction,
  SnapshotRepository,
  TransactionRepository,
} from "@platform/financial-core";
import { accountId, connectionId, isoDate, userId } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { PlaidError } from "../src/plaid/client.js";
import { runSync } from "../src/sync.js";
import type {
  ConnectionStore,
  ProviderConnection,
  SyncPage,
  TransactionProvider,
} from "../src/types.js";

const USER = userId("user-1");

function makeFakes() {
  const accounts = new Map<string, Account>();
  const transactions = new Map<string, NewTransaction>();
  const snapshots: BalanceSnapshot[] = [];
  const connectionUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const accountRepo: AccountRepository = {
    async upsertByExternalId(_u, ext) {
      const existing = accounts.get(ext.externalId);
      const account: Account = {
        ...ext,
        id: existing?.id ?? accountId(`platform-${ext.externalId}`),
      };
      accounts.set(ext.externalId, account);
      return account;
    },
    async listActive() {
      return [...accounts.values()];
    },
  };

  const transactionRepo: TransactionRepository = {
    async upsertMany(_u, txns) {
      for (const t of txns) transactions.set(`${t.source}:${t.sourceTxnId}`, t);
    },
    async findByUser() {
      throw new Error("not used");
    },
    async deleteBySourceIds(_u, source, ids) {
      let n = 0;
      for (const id of ids) {
        if (transactions.delete(`${source}:${id}`)) n++;
      }
      return n;
    },
  };

  const snapshotRepo: SnapshotRepository = {
    async upsert(_u, s) {
      snapshots.push(s);
    },
    async listByUser() {
      return snapshots;
    },
    async latestOnOrBefore() {
      return null;
    },
  };

  const connection: ProviderConnection = {
    id: connectionId("conn-1"),
    userId: USER,
    provider: "plaid",
    externalItemId: "item-1",
    institutionName: "Test Bank",
    accessTokenSecretId: "secret-1",
    cursor: null,
    status: "ok",
  };

  const connections: ConnectionStore = {
    async list() {
      return [connection];
    },
    async update(id, patch) {
      connectionUpdates.push({ id, patch });
    },
  };

  return {
    accounts,
    transactions,
    snapshots,
    connectionUpdates,
    accountRepo,
    transactionRepo,
    snapshotRepo,
    connections,
  };
}

const baseTxn = {
  externalAccountId: "ext-1",
  postedAt: isoDate("2026-08-01"),
  description: "x",
  amountMinor: -1_00,
  pending: false,
};

function pagedProvider(pages: SyncPage[]): TransactionProvider {
  let calls = 0;
  return {
    source: "plaid",
    async fetchAccounts() {
      return [
        { externalId: "ext-1", name: "Checking", kind: "depository", balanceMinor: 100_00 },
        { externalId: "ext-2", name: "Mystery", kind: "other", balanceMinor: null },
      ];
    },
    async syncPage(_token, cursor) {
      const page = pages[calls];
      if (page === undefined) throw new Error("no more pages");
      // First call must receive the connection's stored cursor (null here).
      if (calls === 0) expect(cursor).toBeNull();
      calls++;
      return page;
    },
  };
}

const deps = (fakes: ReturnType<typeof makeFakes>, provider: TransactionProvider) => ({
  provider,
  tokens: { getToken: async () => "access-token" },
  connections: fakes.connections,
  accountRepo: fakes.accountRepo,
  transactionRepo: fakes.transactionRepo,
  snapshotRepo: fakes.snapshotRepo,
  categorize: () => ({ category: "other", source: "rule" }) as const,
  today: isoDate("2026-08-15"),
  now: () => new Date("2026-08-15T09:00:00Z"),
});

describe("runSync", () => {
  it("walks pages, upserts, deletes removals, persists the final cursor", async () => {
    const fakes = makeFakes();
    const provider = pagedProvider([
      {
        added: [
          { ...baseTxn, sourceTxnId: "t1" },
          { ...baseTxn, sourceTxnId: "t2" },
          // Unknown account: skipped, not crashed
          { ...baseTxn, sourceTxnId: "t3", externalAccountId: "unknown" },
        ],
        modified: [],
        removedSourceTxnIds: [],
        nextCursor: "c1",
        hasMore: true,
      },
      {
        added: [],
        modified: [{ ...baseTxn, sourceTxnId: "t1", amountMinor: -2_00 }],
        removedSourceTxnIds: ["t2"],
        nextCursor: "c2",
        hasMore: false,
      },
    ]);

    const reports = await runSync(USER, deps(fakes, provider));
    expect(reports).toEqual([
      { institution: "Test Bank", status: "ok", added: 3, modified: 1, removed: 1 },
    ]);

    // t1 modified in page 2 wins; t2 removed; t3 skipped (unknown account).
    expect([...fakes.transactions.keys()]).toEqual(["plaid:t1"]);
    expect(fakes.transactions.get("plaid:t1")?.amount.amountMinor).toBe(-2_00);

    // Snapshot only for the account that reported a balance.
    expect(fakes.snapshots).toHaveLength(1);
    expect(fakes.snapshots[0]?.balance.amountMinor).toBe(100_00);

    // Final update persists the last cursor and ok status.
    const final = fakes.connectionUpdates.at(-1);
    expect(final?.patch).toMatchObject({ cursor: "c2", status: "ok" });
  });

  it("marks the connection login_required on ITEM_LOGIN_REQUIRED", async () => {
    const fakes = makeFakes();
    const provider: TransactionProvider = {
      source: "plaid",
      async fetchAccounts() {
        throw new PlaidError({ error_code: "ITEM_LOGIN_REQUIRED", error_message: "relink" });
      },
      async syncPage() {
        throw new Error("unreachable");
      },
    };
    const reports = await runSync(USER, deps(fakes, provider));
    expect(reports[0]?.status).toBe("login_required");
    expect(fakes.connectionUpdates).toEqual([
      { id: "conn-1", patch: { status: "login_required" } },
    ]);
  });

  it("marks the connection error on unexpected failures and keeps going", async () => {
    const fakes = makeFakes();
    const provider: TransactionProvider = {
      source: "plaid",
      async fetchAccounts() {
        throw new Error("network down");
      },
      async syncPage() {
        throw new Error("unreachable");
      },
    };
    const reports = await runSync(USER, deps(fakes, provider));
    expect(reports[0]?.status).toBe("error");
    expect(reports[0]?.message).toContain("network down");
    expect(fakes.connectionUpdates).toEqual([{ id: "conn-1", patch: { status: "error" } }]);
  });
});

describe("runSync with the Investments product", () => {
  const simplePages: SyncPage[] = [
    { added: [], modified: [], removedSourceTxnIds: [], nextCursor: "c1", hasMore: false },
  ];

  it("upserts mapped activity and reports ok", async () => {
    const fakes = makeFakes();
    const stored: unknown[] = [];
    const investments = {
      provider: {
        async fetchActivity() {
          return [
            {
              externalAccountId: "ext-1",
              sourceActivityId: "ivt-1",
              date: isoDate("2026-08-01"),
              description: "EMPLOYEE CONTRIBUTION",
              kind: "contribution" as const,
              amountMinor: 65_000,
            },
            {
              externalAccountId: "unknown-acct",
              sourceActivityId: "ivt-skip",
              date: isoDate("2026-08-01"),
              description: "orphan",
              kind: "other" as const,
              amountMinor: 1,
            },
          ];
        },
      },
      repo: {
        async upsertMany(_u: unknown, rows: readonly unknown[]) {
          stored.push(...rows);
        },
        async findByUser() {
          return [];
        },
      },
    };
    const reports = await runSync(USER, {
      ...deps(fakes, pagedProvider(simplePages)),
      investments,
    });
    expect(reports[0]?.investments).toBe("ok");
    expect(reports[0]?.investmentActivityCount).toBe(1); // orphan account skipped
    expect(stored).toHaveLength(1);
  });

  it("reports unsupported (not error) when the item lacks the product", async () => {
    const fakes = makeFakes();
    const investments = {
      provider: {
        async fetchActivity(): Promise<never> {
          throw new PlaidError({ error_code: "PRODUCTS_NOT_SUPPORTED", error_message: "no" });
        },
      },
      repo: {
        async upsertMany() {},
        async findByUser() {
          return [];
        },
      },
    };
    const reports = await runSync(USER, {
      ...deps(fakes, pagedProvider(simplePages)),
      investments,
    });
    expect(reports[0]?.status).toBe("ok"); // main sync unaffected
    expect(reports[0]?.investments).toBe("unsupported");
  });

  it("treats missing investments consent as unsupported (pre-consent legacy items)", async () => {
    const fakes = makeFakes();
    const investments = {
      provider: {
        async fetchActivity(): Promise<never> {
          throw new PlaidError({
            error_code: "ADDITIONAL_CONSENT_REQUIRED",
            error_message: "consent",
          });
        },
      },
      repo: {
        async upsertMany() {},
        async findByUser() {
          return [];
        },
      },
    };
    const reports = await runSync(USER, {
      ...deps(fakes, pagedProvider(simplePages)),
      investments,
    });
    expect(reports[0]?.investments).toBe("unsupported");
    expect(reports[0]?.message).toBeUndefined();
  });

  it("surfaces the Plaid error code when investments fails unexpectedly", async () => {
    const fakes = makeFakes();
    const investments = {
      provider: {
        async fetchActivity(): Promise<never> {
          throw new PlaidError({ error_code: "RATE_LIMIT", error_message: "slow down" });
        },
      },
      repo: {
        async upsertMany() {},
        async findByUser() {
          return [];
        },
      },
    };
    const reports = await runSync(USER, {
      ...deps(fakes, pagedProvider(simplePages)),
      investments,
    });
    expect(reports[0]?.status).toBe("ok"); // still never fails the connection
    expect(reports[0]?.investments).toBe("error");
    expect(reports[0]?.message).toBe("investments: RATE_LIMIT");
  });
});
