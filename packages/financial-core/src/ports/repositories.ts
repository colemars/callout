import type { ISODate } from "../dates/local-date.js";
import type { Account } from "../entities/account.js";
import type { Goal } from "../entities/goal.js";
import type { InvestmentActivity } from "../entities/investment-activity.js";
import type { BalanceSnapshot, Budget } from "../entities/misc.js";
import type { Transaction, TransactionSource } from "../entities/transaction.js";
import type { AccountId, UserId } from "../ids.js";

/**
 * Repository ports (ARCHITECTURE.md "Repository Pattern"). Business logic
 * depends on these interfaces; packages/repositories provides the Drizzle
 * implementations. Every method scopes by userId — multi-tenant from day one.
 */

export interface DateRange {
  readonly from?: ISODate;
  readonly to?: ISODate;
}

/** Ingestion-shaped transaction: the database assigns the platform id. */
export type NewTransaction = Omit<Transaction, "id">;

export interface TransactionRepository {
  /** Upsert keyed on (userId, source, sourceTxnId). */
  upsertMany(userId: UserId, transactions: readonly NewTransaction[]): Promise<void>;
  findByUser(userId: UserId, range?: DateRange): Promise<Transaction[]>;
  deleteBySourceIds(
    userId: UserId,
    source: TransactionSource,
    sourceTxnIds: readonly string[],
  ): Promise<number>;
}

/** Provider-shaped account payload: the database assigns the platform id. */
export type ExternalAccount = Omit<Account, "id" | "externalId"> & { readonly externalId: string };

export interface AccountRepository {
  /** Upsert keyed on (userId, source, externalId) — the ingestion path. */
  upsertByExternalId(userId: UserId, account: ExternalAccount): Promise<Account>;
  listActive(userId: UserId): Promise<Account[]>;
}

export interface GoalRepository {
  listActive(userId: UserId): Promise<Goal[]>;
}

export interface BudgetRepository {
  listActive(userId: UserId): Promise<Budget[]>;
}

/** Ingestion-shaped activity: the database assigns the platform id. */
export type NewInvestmentActivity = Omit<InvestmentActivity, "id">;

export interface InvestmentActivityRepository {
  /** Upsert keyed on (userId, source, sourceActivityId). */
  upsertMany(userId: UserId, activity: readonly NewInvestmentActivity[]): Promise<void>;
  findByUser(userId: UserId, range?: DateRange): Promise<InvestmentActivity[]>;
}

export interface SnapshotRepository {
  upsert(userId: UserId, snapshot: BalanceSnapshot): Promise<void>;
  listByUser(userId: UserId): Promise<BalanceSnapshot[]>;
  /** Latest snapshot for the account on or before the given date. */
  latestOnOrBefore(
    userId: UserId,
    accountId: AccountId,
    date: ISODate,
  ): Promise<BalanceSnapshot | null>;
}
