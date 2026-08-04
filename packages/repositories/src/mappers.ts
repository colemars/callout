import type {
  accounts,
  balanceSnapshots,
  budgets,
  goals,
  investmentActivity,
  transactions,
} from "@platform/database";
import type {
  Account,
  AccountKind,
  AccountSource,
  BalanceSnapshot,
  Budget,
  Category,
  CurrencyCode,
  Goal,
  InvestmentActivity,
  InvestmentActivityKind,
  Transaction,
  TransactionSource,
} from "@platform/financial-core";
import {
  accountId,
  connectionId,
  goalId,
  investmentActivityId,
  isCategory,
  isoDate,
  money,
  transactionId,
  userId,
} from "@platform/financial-core";

type AccountRow = typeof accounts.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type GoalRow = typeof goals.$inferSelect;
type BudgetRow = typeof budgets.$inferSelect;
type SnapshotRow = typeof balanceSnapshots.$inferSelect;

const currency = (c: string): CurrencyCode => c as CurrencyCode;

export function accountFromRow(row: AccountRow): Account {
  return {
    id: accountId(row.id),
    userId: userId(row.userId),
    source: row.source as AccountSource,
    name: row.name,
    institution: row.institution,
    kind: row.kind as AccountKind,
    balance: money(row.balanceMinor, currency(row.currency)),
    isActive: row.isActive,
    ...(row.externalId === null ? {} : { externalId: row.externalId }),
    ...(row.connectionId === null ? {} : { connectionId: connectionId(row.connectionId) }),
    ...(row.subtype === null ? {} : { subtype: row.subtype }),
    ...(row.mask === null ? {} : { mask: row.mask }),
    ...(row.creditLimitMinor === null
      ? {}
      : { creditLimit: money(row.creditLimitMinor, currency(row.currency)) }),
    ...(row.balanceAsOf === null ? {} : { balanceAsOf: isoDate(row.balanceAsOf) }),
  };
}

export function transactionFromRow(row: TransactionRow): Transaction {
  return {
    id: transactionId(row.id),
    userId: userId(row.userId),
    accountId: accountId(row.accountId),
    source: row.source as TransactionSource,
    sourceTxnId: row.sourceTxnId,
    postedAt: isoDate(row.postedAt),
    description: row.description,
    amount: money(row.amountMinor, currency(row.currency)),
    pending: row.pending,
    category: (isCategory(row.category) ? row.category : "other") as Category,
    ...(row.authorizedAt === null ? {} : { authorizedAt: isoDate(row.authorizedAt) }),
    ...(row.merchant === null ? {} : { merchant: row.merchant }),
    ...(row.sourceCategory === null ? {} : { sourceCategory: row.sourceCategory }),
  };
}

/** Rows with a kind that requires an account but lacks one are invalid; returns null. */
export function goalFromRow(row: GoalRow): Goal | null {
  const common = {
    id: goalId(row.id),
    userId: userId(row.userId),
    targetAmount: money(row.targetAmountMinor, currency(row.currency)),
    active: row.active,
    ...(row.targetDate === null ? {} : { targetDate: isoDate(row.targetDate) }),
    ...(row.startedAt === null ? {} : { startedAt: isoDate(row.startedAt) }),
    ...(row.baselineAmountMinor === null
      ? {}
      : { baselineAmount: money(row.baselineAmountMinor, currency(row.currency)) }),
    ...(row.note === null ? {} : { note: row.note }),
  };
  switch (row.kind) {
    case "savings_net_flow":
      return { ...common, kind: "savings_net_flow" };
    case "balance_target":
      return row.accountId === null
        ? null
        : { ...common, kind: "balance_target", accountId: accountId(row.accountId) };
    case "debt_paydown":
      return row.accountId === null
        ? null
        : { ...common, kind: "debt_paydown", accountId: accountId(row.accountId) };
    default:
      return null;
  }
}

export function budgetFromRow(row: BudgetRow): Budget | null {
  if (!isCategory(row.category)) return null;
  return {
    userId: userId(row.userId),
    category: row.category,
    monthlyCap: money(row.monthlyCapMinor, currency(row.currency)),
    active: row.active,
  };
}

type InvestmentActivityRow = typeof investmentActivity.$inferSelect;

export function investmentActivityFromRow(row: InvestmentActivityRow): InvestmentActivity {
  return {
    id: investmentActivityId(row.id),
    userId: userId(row.userId),
    accountId: accountId(row.accountId),
    source: "plaid",
    sourceActivityId: row.sourceActivityId,
    date: isoDate(row.date),
    description: row.description,
    kind: row.kind as InvestmentActivityKind,
    amount: money(row.amountMinor, currency(row.currency)),
    ...(row.securityTicker === null ? {} : { ticker: row.securityTicker }),
    ...(row.quantity === null ? {} : { quantity: row.quantity }),
  };
}

export function snapshotFromRow(row: SnapshotRow): BalanceSnapshot {
  return {
    userId: userId(row.userId),
    accountId: accountId(row.accountId),
    asOf: isoDate(row.asOf),
    balance: money(row.balanceMinor, currency(row.currency)),
  };
}
