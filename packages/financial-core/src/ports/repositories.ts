import type { ISODate } from "../dates/local-date.js";
import type { Account } from "../entities/account.js";
import type { Goal } from "../entities/goal.js";
import type { BalanceSnapshot } from "../entities/misc.js";
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

export interface TransactionRepository {
  upsertMany(userId: UserId, transactions: readonly Transaction[]): Promise<void>;
  findByUser(userId: UserId, range?: DateRange): Promise<Transaction[]>;
  deleteBySourceIds(
    userId: UserId,
    source: TransactionSource,
    sourceTxnIds: readonly string[],
  ): Promise<number>;
}

export interface AccountRepository {
  upsert(userId: UserId, account: Account): Promise<Account>;
  listActive(userId: UserId): Promise<Account[]>;
}

export interface GoalRepository {
  listActive(userId: UserId): Promise<Goal[]>;
}

export interface SnapshotRepository {
  upsert(userId: UserId, snapshot: BalanceSnapshot): Promise<void>;
  /** Latest snapshot for the account on or before the given date. */
  latestOnOrBefore(
    userId: UserId,
    accountId: AccountId,
    date: ISODate,
  ): Promise<BalanceSnapshot | null>;
}
