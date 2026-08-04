import type { PlatformDb } from "@platform/database";
import {
  accounts,
  balanceSnapshots,
  budgets,
  goals,
  investmentActivity,
  transactions,
} from "@platform/database";
import type {
  AccountId,
  AccountRepository,
  BalanceSnapshot,
  BudgetRepository,
  DateRange,
  ExternalAccount,
  GoalRepository,
  ISODate,
  InvestmentActivityRepository,
  NewInvestmentActivity,
  NewTransaction,
  SnapshotRepository,
  TransactionRepository,
  TransactionSource,
  UserId,
} from "@platform/financial-core";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  accountFromRow,
  budgetFromRow,
  goalFromRow,
  investmentActivityFromRow,
  snapshotFromRow,
  transactionFromRow,
} from "./mappers.js";

export function createAccountRepository(db: PlatformDb): AccountRepository {
  return {
    async upsertByExternalId(userId: UserId, account: ExternalAccount) {
      const values = {
        userId,
        source: account.source,
        externalId: account.externalId,
        connectionId: account.connectionId ?? null,
        name: account.name,
        institution: account.institution,
        kind: account.kind,
        subtype: account.subtype ?? null,
        mask: account.mask ?? null,
        balanceMinor: account.balance.amountMinor,
        currency: account.balance.currency,
        creditLimitMinor: account.creditLimit?.amountMinor ?? null,
        balanceAsOf: account.balanceAsOf ?? null,
        isActive: account.isActive,
      };
      const [row] = await db
        .insert(accounts)
        .values(values)
        .onConflictDoUpdate({
          target: [accounts.userId, accounts.source, accounts.externalId],
          // Must match the partial unique index accounts_user_source_external_ux.
          targetWhere: sql`external_id is not null`,
          set: values,
        })
        .returning();
      if (row === undefined) throw new Error("account upsert returned no row");
      return accountFromRow(row);
    },

    async listActive(userId: UserId) {
      const rows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))
        .orderBy(asc(accounts.institution), asc(accounts.name));
      return rows.map(accountFromRow);
    },
  };
}

export function createTransactionRepository(db: PlatformDb): TransactionRepository {
  return {
    async upsertMany(userId: UserId, txns: readonly NewTransaction[]) {
      for (const t of txns) {
        const values = {
          userId,
          accountId: t.accountId,
          source: t.source,
          sourceTxnId: t.sourceTxnId,
          postedAt: t.postedAt,
          authorizedAt: t.authorizedAt ?? null,
          description: t.description,
          merchant: t.merchant ?? null,
          amountMinor: t.amount.amountMinor,
          currency: t.amount.currency,
          pending: t.pending,
          category: t.category,
          sourceCategory: t.sourceCategory ?? null,
        };
        await db
          .insert(transactions)
          .values(values)
          .onConflictDoUpdate({
            target: [transactions.userId, transactions.source, transactions.sourceTxnId],
            set: values,
          });
      }
    },

    async findByUser(userId: UserId, range?: DateRange) {
      const conditions = [eq(transactions.userId, userId)];
      if (range?.from !== undefined) conditions.push(gte(transactions.postedAt, range.from));
      if (range?.to !== undefined) conditions.push(lte(transactions.postedAt, range.to));
      const rows = await db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.postedAt), asc(transactions.id));
      return rows.map(transactionFromRow);
    },

    async deleteBySourceIds(userId: UserId, source: TransactionSource, ids: readonly string[]) {
      if (ids.length === 0) return 0;
      const deleted = await db
        .delete(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.source, source),
            inArray(transactions.sourceTxnId, [...ids]),
          ),
        )
        .returning({ id: transactions.id });
      return deleted.length;
    },
  };
}

export function createGoalRepository(db: PlatformDb): GoalRepository {
  return {
    async listActive(userId: UserId) {
      const rows = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.active, true)))
        .orderBy(asc(goals.id));
      return rows.map(goalFromRow).filter((g) => g !== null);
    },
  };
}

export function createBudgetRepository(db: PlatformDb): BudgetRepository {
  return {
    async listActive(userId: UserId) {
      const rows = await db
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.active, true)))
        .orderBy(asc(budgets.category));
      return rows.map(budgetFromRow).filter((b) => b !== null);
    },
  };
}

export function createInvestmentActivityRepository(db: PlatformDb): InvestmentActivityRepository {
  return {
    async upsertMany(userId: UserId, activity: readonly NewInvestmentActivity[]) {
      for (const a of activity) {
        const values = {
          userId,
          accountId: a.accountId,
          source: a.source,
          sourceActivityId: a.sourceActivityId,
          date: a.date,
          description: a.description,
          kind: a.kind,
          amountMinor: a.amount.amountMinor,
          currency: a.amount.currency,
          securityTicker: a.ticker ?? null,
          quantity: a.quantity ?? null,
        };
        await db
          .insert(investmentActivity)
          .values(values)
          .onConflictDoUpdate({
            target: [
              investmentActivity.userId,
              investmentActivity.source,
              investmentActivity.sourceActivityId,
            ],
            set: values,
          });
      }
    },

    async findByUser(userId: UserId, range?: DateRange) {
      const conditions = [eq(investmentActivity.userId, userId)];
      if (range?.from !== undefined) conditions.push(gte(investmentActivity.date, range.from));
      if (range?.to !== undefined) conditions.push(lte(investmentActivity.date, range.to));
      const rows = await db
        .select()
        .from(investmentActivity)
        .where(and(...conditions))
        .orderBy(desc(investmentActivity.date), asc(investmentActivity.id));
      return rows.map(investmentActivityFromRow);
    },
  };
}

export function createSnapshotRepository(db: PlatformDb): SnapshotRepository {
  return {
    async upsert(userId: UserId, snapshot: BalanceSnapshot) {
      const values = {
        userId,
        accountId: snapshot.accountId,
        asOf: snapshot.asOf,
        balanceMinor: snapshot.balance.amountMinor,
        currency: snapshot.balance.currency,
      };
      await db
        .insert(balanceSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [balanceSnapshots.accountId, balanceSnapshots.asOf],
          set: values,
        });
    },

    async listByUser(userId: UserId) {
      const rows = await db
        .select()
        .from(balanceSnapshots)
        .where(eq(balanceSnapshots.userId, userId))
        .orderBy(asc(balanceSnapshots.accountId), asc(balanceSnapshots.asOf));
      return rows.map(snapshotFromRow);
    },

    async latestOnOrBefore(userId: UserId, accountId: AccountId, date: ISODate) {
      const rows = await db
        .select()
        .from(balanceSnapshots)
        .where(
          and(
            eq(balanceSnapshots.userId, userId),
            eq(balanceSnapshots.accountId, accountId),
            lte(balanceSnapshots.asOf, date),
          ),
        )
        .orderBy(desc(balanceSnapshots.asOf))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : snapshotFromRow(row);
    },
  };
}
