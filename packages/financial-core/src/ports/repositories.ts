import type { ISODate } from "../dates/local-date.js";
import type { Account } from "../entities/account.js";
import type { Category } from "../entities/category.js";
import type { Goal, NewGoal } from "../entities/goal.js";
import type { InvestmentActivity } from "../entities/investment-activity.js";
import type { AccountLiability } from "../entities/liability.js";
import type { BalanceSnapshot, Budget } from "../entities/misc.js";
import type { Transaction, TransactionSource } from "../entities/transaction.js";
import type { AccountId, GoalId, TransactionId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

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
  /** Upsert keyed on (userId, source, sourceTxnId). Never clobbers a 'user' category. */
  upsertMany(userId: UserId, transactions: readonly NewTransaction[]): Promise<void>;
  findByUser(userId: UserId, range?: DateRange): Promise<Transaction[]>;
  deleteBySourceIds(
    userId: UserId,
    source: TransactionSource,
    sourceTxnIds: readonly string[],
  ): Promise<number>;
  /** The user's correction — category becomes law (categorySource 'user'). Null: not their txn. */
  setCategoryByUser(
    userId: UserId,
    id: TransactionId,
    category: Category,
  ): Promise<Transaction | null>;
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
  create(userId: UserId, goal: NewGoal): Promise<Goal>;
  /** Partial update; null return = not this user's goal. */
  update(
    userId: UserId,
    id: GoalId,
    patch: {
      readonly targetAmount?: Money;
      readonly targetDate?: ISODate | null;
      readonly note?: string | null;
      readonly active?: boolean;
    },
  ): Promise<Goal | null>;
}

export interface BudgetRepository {
  listActive(userId: UserId): Promise<Budget[]>;
  /** Upsert the decree for a category (re-issuing reactivates). */
  upsert(userId: UserId, category: Category, monthlyCap: Money): Promise<Budget>;
  /** Repeal: deactivates; returns false when no such decree. */
  deactivate(userId: UserId, category: Category): Promise<boolean>;
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

export interface LiabilityRepository {
  /** Upsert keyed on accountId (one snapshot per account). */
  upsertMany(userId: UserId, rows: readonly AccountLiability[]): Promise<void>;
  listForUser(userId: UserId): Promise<AccountLiability[]>;
}
