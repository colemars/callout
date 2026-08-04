import type {
  AccountId,
  AccountRepository,
  ISODate,
  InvestmentActivityRepository,
  NewInvestmentActivity,
  NewTransaction,
  SnapshotRepository,
  TransactionRepository,
  UserId,
} from "@platform/financial-core";
import { addDays, money } from "@platform/financial-core";
import type { InvestmentsProvider } from "./investments/provider.js";
import { PlaidError } from "./plaid/client.js";
import type {
  AccessTokenStore,
  CategorizeFn,
  ConnectionStore,
  ProviderConnection,
  ProviderTransaction,
  TransactionProvider,
} from "./types.js";

export interface SyncDeps {
  readonly provider: TransactionProvider;
  /** Optional Investments product sync (trailing-window, idempotent upserts). */
  readonly investments?: {
    readonly provider: InvestmentsProvider;
    readonly repo: InvestmentActivityRepository;
  };
  readonly tokens: AccessTokenStore;
  readonly connections: ConnectionStore;
  readonly accountRepo: AccountRepository;
  readonly transactionRepo: TransactionRepository;
  readonly snapshotRepo: SnapshotRepository;
  readonly categorize: CategorizeFn;
  /** Injected clock values — the orchestrator itself never reads a clock. */
  readonly today: ISODate;
  readonly now: () => Date;
}

export interface SyncReport {
  readonly institution: string;
  readonly status: "ok" | "login_required" | "error";
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  /** Investments product outcome; absent when the sync isn't configured for it. */
  readonly investments?: "ok" | "unsupported" | "error";
  readonly investmentActivityCount?: number;
  readonly message?: string;
}

/**
 * Provider-agnostic sync orchestration, ported from the legacy plaid-sync edge
 * function: accounts + balances first (loan accounts may never appear in the
 * transaction stream), then the cursor loop, then cursor/status persistence.
 */
export async function runSync(userId: UserId, deps: SyncDeps): Promise<SyncReport[]> {
  const reports: SyncReport[] = [];
  for (const connection of await deps.connections.list(userId)) {
    const institution = connection.institutionName ?? connection.externalItemId;
    try {
      reports.push(await syncConnection(userId, connection, institution, deps));
    } catch (error) {
      if (error instanceof PlaidError && error.code === "ITEM_LOGIN_REQUIRED") {
        await deps.connections.update(connection.id, { status: "login_required" });
        reports.push({ institution, status: "login_required", added: 0, modified: 0, removed: 0 });
      } else {
        await deps.connections.update(connection.id, { status: "error" });
        reports.push({
          institution,
          status: "error",
          added: 0,
          modified: 0,
          removed: 0,
          message: String(error),
        });
      }
    }
  }
  return reports;
}

async function syncConnection(
  userId: UserId,
  connection: ProviderConnection,
  institution: string,
  deps: SyncDeps,
): Promise<SyncReport> {
  const token = await deps.tokens.getToken(connection.accessTokenSecretId);

  // Accounts + balances first.
  const accountIds = new Map<string, AccountId>();
  for (const pa of await deps.provider.fetchAccounts(token)) {
    const account = await deps.accountRepo.upsertByExternalId(userId, {
      userId,
      source: deps.provider.source,
      externalId: pa.externalId,
      connectionId: connection.id,
      name: pa.name,
      institution,
      kind: pa.kind,
      balance: money(pa.balanceMinor ?? 0),
      isActive: true,
      balanceAsOf: deps.today,
      ...(pa.subtype === undefined ? {} : { subtype: pa.subtype }),
      ...(pa.mask === undefined ? {} : { mask: pa.mask }),
      ...(pa.creditLimitMinor == null ? {} : { creditLimit: money(pa.creditLimitMinor) }),
    });
    accountIds.set(pa.externalId, account.id);
    if (pa.balanceMinor !== null) {
      await deps.snapshotRepo.upsert(userId, {
        userId,
        accountId: account.id,
        asOf: deps.today,
        balance: money(pa.balanceMinor),
      });
    }
  }

  // Cursor loop.
  let cursor = connection.cursor;
  let added = 0;
  let modified = 0;
  let removed = 0;
  for (;;) {
    const page = await deps.provider.syncPage(token, cursor);
    const upserts: NewTransaction[] = [];
    for (const pt of [...page.added, ...page.modified]) {
      const accountId = accountIds.get(pt.externalAccountId);
      if (accountId === undefined) continue;
      upserts.push(toNewTransaction(userId, accountId, deps.provider.source, pt, deps.categorize));
    }
    await deps.transactionRepo.upsertMany(userId, upserts);
    added += page.added.length;
    modified += page.modified.length;
    if (page.removedSourceTxnIds.length > 0) {
      removed += await deps.transactionRepo.deleteBySourceIds(
        userId,
        deps.provider.source,
        page.removedSourceTxnIds,
      );
    }
    cursor = page.nextCursor;
    if (!page.hasMore) break;
  }

  // Investments product: trailing-window fetch, idempotent by sourceActivityId.
  // Its failures never fail the whole connection sync.
  let investments: SyncReport["investments"];
  let investmentActivityCount: number | undefined;
  let investmentsMessage: string | undefined;
  if (deps.investments !== undefined) {
    try {
      const activity = await deps.investments.provider.fetchActivity(
        token,
        addDays(deps.today, -90),
        deps.today,
      );
      const upserts: NewInvestmentActivity[] = [];
      for (const a of activity) {
        const accountId = accountIds.get(a.externalAccountId);
        if (accountId === undefined) continue;
        upserts.push({
          userId,
          accountId,
          source: "plaid",
          sourceActivityId: a.sourceActivityId,
          date: a.date,
          description: a.description,
          kind: a.kind,
          amount: money(a.amountMinor),
          ...(a.ticker === undefined ? {} : { ticker: a.ticker }),
          ...(a.quantity === undefined ? {} : { quantity: a.quantity }),
        });
      }
      await deps.investments.repo.upsertMany(userId, upserts);
      investments = "ok";
      investmentActivityCount = upserts.length;
    } catch (error) {
      if (
        error instanceof PlaidError &&
        [
          "PRODUCTS_NOT_SUPPORTED",
          "PRODUCT_NOT_READY",
          "NO_INVESTMENT_ACCOUNTS",
          "INVALID_PRODUCT",
          // Items linked before investments consent existed can't grant it retroactively.
          "ADDITIONAL_CONSENT_REQUIRED",
        ].includes(error.code)
      ) {
        investments = "unsupported";
      } else {
        investments = "error";
        investmentsMessage = `investments: ${error instanceof PlaidError ? error.code : String(error)}`;
      }
    }
  }

  await deps.connections.update(connection.id, {
    cursor,
    status: "ok",
    lastSyncedAt: deps.now(),
  });
  return {
    institution,
    status: "ok",
    added,
    modified,
    removed,
    ...(investments === undefined ? {} : { investments }),
    ...(investmentActivityCount === undefined ? {} : { investmentActivityCount }),
    ...(investmentsMessage === undefined ? {} : { message: investmentsMessage }),
  };
}

function toNewTransaction(
  userId: UserId,
  accountId: AccountId,
  source: TransactionProvider["source"],
  pt: ProviderTransaction,
  categorize: CategorizeFn,
): NewTransaction {
  return {
    userId,
    accountId,
    source,
    sourceTxnId: pt.sourceTxnId,
    postedAt: pt.postedAt,
    description: pt.description,
    amount: money(pt.amountMinor),
    pending: pt.pending,
    category: categorize(
      pt.sourceCategoryDetailed ?? null,
      pt.sourceCategoryPrimary ?? null,
      pt.merchant ?? null,
      pt.description,
    ),
    ...(pt.authorizedAt === undefined ? {} : { authorizedAt: pt.authorizedAt }),
    ...(pt.merchant === undefined ? {} : { merchant: pt.merchant }),
    ...(pt.sourceCategoryDetailed === undefined
      ? {}
      : { sourceCategory: pt.sourceCategoryDetailed }),
  };
}
