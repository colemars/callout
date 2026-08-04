import type {
  Account,
  BalanceSnapshot,
  Budget,
  Category,
  Goal,
  ISODate,
  Transaction,
} from "@platform/financial-core";
import { accountId, goalId, isoDate, money, transactionId, userId } from "@platform/financial-core";
import type { FinancialState } from "../src/state.js";

export const USER = userId("user-1");
export const CHECKING = accountId("acct-checking");
export const CARD = accountId("acct-card");

export function txn(
  overrides: Omit<Partial<Transaction>, "postedAt" | "amount"> & {
    postedAt: string;
    amountMinor: number;
  },
): Transaction {
  const { postedAt, amountMinor, ...rest } = overrides;
  return {
    id: transactionId(`txn-${postedAt}-${amountMinor}-${rest.merchant ?? rest.category ?? "x"}`),
    userId: USER,
    accountId: CHECKING,
    source: "plaid",
    sourceTxnId: `src-${postedAt}-${amountMinor}-${rest.merchant ?? "x"}`,
    postedAt: isoDate(postedAt),
    description: rest.merchant ?? "test transaction",
    amount: money(amountMinor),
    pending: false,
    category: "other" as Category,
    ...rest,
  };
}

export function account(overrides: Partial<Account> & { id?: Account["id"] }): Account {
  return {
    id: CHECKING,
    userId: USER,
    source: "plaid",
    name: "Checking",
    institution: "Test Bank",
    kind: "depository",
    balance: money(0),
    isActive: true,
    ...overrides,
  };
}

export function budget(category: Category, capMinor: number): Budget {
  return { userId: USER, category, monthlyCap: money(capMinor), active: true };
}

export function snapshot(acct: Account["id"], asOf: string, balanceMinor: number): BalanceSnapshot {
  return { userId: USER, accountId: acct, asOf: isoDate(asOf), balance: money(balanceMinor) };
}

export function savingsGoal(overrides: {
  id?: string;
  targetMinor: number;
  startedAt: string;
  targetDate: string;
  baselineMinor?: number;
}): Goal {
  return {
    kind: "savings_net_flow",
    id: goalId(overrides.id ?? "goal-savings"),
    userId: USER,
    targetAmount: money(overrides.targetMinor),
    targetDate: isoDate(overrides.targetDate),
    startedAt: isoDate(overrides.startedAt),
    baselineAmount: money(overrides.baselineMinor ?? 0),
    active: true,
  };
}

export function emptyState(overrides?: Partial<FinancialState>): FinancialState {
  return {
    userId: USER,
    accounts: [],
    transactions: [],
    budgets: [],
    goals: [],
    snapshots: [],
    ...overrides,
  };
}

/** Monthly charges for one merchant: same day each month, similar amounts. */
export function monthlyCharges(
  merchant: string,
  months: readonly string[], // "YYYY-MM"
  day: string, // "DD"
  amountsMinor: readonly number[],
): Transaction[] {
  return months.map((m, i) =>
    txn({
      postedAt: `${m}-${day}`,
      amountMinor: -(amountsMinor[i] ?? amountsMinor[0] ?? 0),
      merchant,
      category: "subscriptions" as Category,
    }),
  );
}

export const AS_OF: ISODate = isoDate("2026-08-15");
