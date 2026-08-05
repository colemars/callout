import type {
  AccountId,
  AccountLiability,
  AccountRepository,
  ISODate,
  InvestmentActivityRepository,
  LiabilityRepository,
  NewInvestmentActivity,
  NewTransaction,
  SnapshotRepository,
  TransactionRepository,
  UserId,
} from "@platform/financial-core";
import { addDays, money } from "@platform/financial-core";
import type { InvestmentsProvider } from "./investments/provider.js";
import type { LiabilitiesProvider } from "./liabilities/provider.js";
import { PlaidError } from "./plaid/client.js";
import type {
  AccessTokenStore,
  CategorizeFn,
  ConnectionStore,
  ProductGrantStatus,
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
  /** Optional Liabilities product sync (APRs, min payments, due dates). */
  readonly liabilities?: {
    readonly provider: LiabilitiesProvider;
    readonly repo: LiabilityRepository;
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
  /** Liabilities product outcome; absent when the sync isn't configured for it. */
  readonly liabilities?: "ok" | "unsupported" | "error";
  readonly liabilityCount?: number;
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
  let investmentsGrant: ProductGrantStatus | undefined;
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
      investmentsGrant = "ok";
      investmentActivityCount = upserts.length;
    } catch (error) {
      if (error instanceof PlaidError && error.code === "ADDITIONAL_CONSENT_REQUIRED") {
        // A re-link CAN grant this — remembered so the UI can offer it.
        investments = "unsupported";
        investmentsGrant = "consent_required";
      } else if (
        error instanceof PlaidError &&
        [
          "PRODUCTS_NOT_SUPPORTED",
          "PRODUCT_NOT_READY",
          "NO_INVESTMENT_ACCOUNTS",
          "INVALID_PRODUCT",
        ].includes(error.code)
      ) {
        investments = "unsupported";
        investmentsGrant = "unsupported";
      } else {
        investments = "error";
        investmentsGrant = "error";
        investmentsMessage = `investments: ${error instanceof PlaidError ? error.code : String(error)}`;
      }
    }
  }

  // Liabilities product: one snapshot per debt account per sync. Like
  // investments, its failures never fail the whole connection sync.
  let liabilities: SyncReport["liabilities"];
  let liabilitiesGrant: ProductGrantStatus | undefined;
  let liabilityCount: number | undefined;
  let liabilitiesMessage: string | undefined;
  if (deps.liabilities !== undefined) {
    try {
      const rows = await deps.liabilities.provider.fetchLiabilities(token);
      const upserts: AccountLiability[] = [];
      for (const row of rows) {
        const accountId = accountIds.get(row.externalAccountId);
        if (accountId === undefined) continue;
        upserts.push({
          accountId,
          userId,
          kind: row.kind,
          ...(row.aprBps === undefined ? {} : { aprBps: row.aprBps }),
          ...(row.aprType === undefined ? {} : { aprType: row.aprType }),
          ...(row.minPaymentMinor === undefined ? {} : { minPayment: money(row.minPaymentMinor) }),
          ...(row.nextDueDate === undefined ? {} : { nextDueDate: row.nextDueDate }),
          ...(row.isOverdue === undefined ? {} : { isOverdue: row.isOverdue }),
          ...(row.lastPaymentMinor === undefined
            ? {}
            : { lastPayment: money(row.lastPaymentMinor) }),
        });
      }
      await deps.liabilities.repo.upsertMany(userId, upserts);
      liabilities = "ok";
      liabilitiesGrant = "ok";
      liabilityCount = upserts.length;
    } catch (error) {
      if (error instanceof PlaidError && error.code === "ADDITIONAL_CONSENT_REQUIRED") {
        // A re-link CAN grant this — remembered so the UI can offer it.
        liabilities = "unsupported";
        liabilitiesGrant = "consent_required";
      } else if (
        error instanceof PlaidError &&
        [
          "PRODUCTS_NOT_SUPPORTED",
          "PRODUCT_NOT_READY",
          "NO_LIABILITY_ACCOUNTS",
          "INVALID_PRODUCT",
        ].includes(error.code)
      ) {
        liabilities = "unsupported";
        liabilitiesGrant = "unsupported";
      } else {
        liabilities = "error";
        liabilitiesGrant = "error";
        liabilitiesMessage = `liabilities: ${error instanceof PlaidError ? error.code : String(error)}`;
      }
    }
  }

  const products: Record<string, ProductGrantStatus> = {
    ...(investmentsGrant === undefined ? {} : { investments: investmentsGrant }),
    ...(liabilitiesGrant === undefined ? {} : { liabilities: liabilitiesGrant }),
  };
  await deps.connections.update(connection.id, {
    cursor,
    status: "ok",
    lastSyncedAt: deps.now(),
    ...(Object.keys(products).length === 0 ? {} : { products }),
  });
  return {
    institution,
    status: "ok",
    added,
    modified,
    removed,
    ...(investments === undefined ? {} : { investments }),
    ...(investmentActivityCount === undefined ? {} : { investmentActivityCount }),
    ...(liabilities === undefined ? {} : { liabilities }),
    ...(liabilityCount === undefined ? {} : { liabilityCount }),
    ...(investmentsMessage === undefined && liabilitiesMessage === undefined
      ? {}
      : { message: [investmentsMessage, liabilitiesMessage].filter(Boolean).join("; ") }),
  };
}

function toNewTransaction(
  userId: UserId,
  accountId: AccountId,
  source: TransactionProvider["source"],
  pt: ProviderTransaction,
  categorize: CategorizeFn,
): NewTransaction {
  const verdict = categorize(
    pt.sourceCategoryDetailed ?? null,
    pt.sourceCategoryPrimary ?? null,
    pt.merchant ?? null,
    pt.description,
  );
  return {
    userId,
    accountId,
    source,
    sourceTxnId: pt.sourceTxnId,
    postedAt: pt.postedAt,
    description: pt.description,
    amount: money(pt.amountMinor),
    pending: pt.pending,
    category: verdict.category,
    categorySource: verdict.source,
    ...(pt.authorizedAt === undefined ? {} : { authorizedAt: pt.authorizedAt }),
    ...(pt.merchant === undefined ? {} : { merchant: pt.merchant }),
    ...(pt.sourceCategoryDetailed === undefined
      ? {}
      : { sourceCategory: pt.sourceCategoryDetailed }),
  };
}
