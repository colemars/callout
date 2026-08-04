import type {
  KingdomAccount,
  KingdomInput,
  KingdomMetrics,
  KingdomTxn,
  MonthSummaryView,
} from "../src/model/types";

export const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });

// Ids derive from content so repeated fixture builds are identical —
// the diff engine tests depend on stable refIds across builds.
export function account(
  overrides: Partial<KingdomAccount> & { kind: KingdomAccount["kind"]; balanceMinor: number },
): KingdomAccount {
  const { balanceMinor, ...rest } = overrides;
  return {
    id: rest.id ?? `acct-${(rest.name ?? "account").toLowerCase().replace(/\W+/g, "-")}`,
    name: rest.name ?? "Account",
    institution: "Tartan Bank",
    balance: usd(balanceMinor),
    ...rest,
  } as KingdomAccount;
}

export function txn(
  overrides: Partial<KingdomTxn> & { postedAt: string; amountMinor: number },
): KingdomTxn {
  const { amountMinor, ...rest } = overrides;
  return {
    id:
      rest.id ??
      `txn-${overrides.postedAt}-${amountMinor}-${(rest.merchant ?? rest.description ?? "x")
        .toLowerCase()
        .replace(/\W+/g, "-")}`,
    description: rest.description ?? rest.merchant ?? "LEDGER LINE",
    amount: usd(amountMinor),
    category: rest.category ?? "other",
    pending: false,
    ...rest,
  } as KingdomTxn;
}

export function month(
  m: string,
  spendingByCategoryMinor: Record<string, number>,
  netCashFlowMinor: number,
  transactionCount = 10,
): MonthSummaryView {
  const spendingByCategory = Object.entries(spendingByCategoryMinor).map(
    ([category, amountMinor]) => ({ category, amount: usd(amountMinor) }),
  );
  return {
    month: m,
    transactionCount,
    totalSpending: usd(Object.values(spendingByCategoryMinor).reduce((a, b) => a + b, 0)),
    spendingByCategory,
    netCashFlow: usd(netCashFlowMinor),
  };
}

/** The Tartan sandbox, day one: rich stores, bandits at the gate, first moon open. */
export function sandboxInput(overrides?: Partial<KingdomInput>): KingdomInput {
  const accounts: KingdomAccount[] = [
    account({
      kind: "depository",
      subtype: "checking",
      name: "Plaid Checking",
      balanceMinor: 110_00,
    }),
    account({ kind: "depository", subtype: "savings", name: "Plaid Saving", balanceMinor: 210_00 }),
    account({
      kind: "depository",
      subtype: "money market",
      name: "Plaid Money Market",
      balanceMinor: 43_200_00,
    }),
    account({ kind: "depository", subtype: "cd", name: "Plaid CD", balanceMinor: 1_000_00 }),
    account({
      kind: "depository",
      subtype: "cash management",
      name: "Plaid Cash Management",
      balanceMinor: 12_060_00,
    }),
    account({ kind: "depository", subtype: "hsa", name: "Plaid HSA", balanceMinor: 6_009_00 }),
    account({ kind: "investment", subtype: "401k", name: "Plaid 401k", balanceMinor: 23_631_00 }),
    account({ kind: "investment", subtype: "ira", name: "Plaid IRA", balanceMinor: 320_00 }),
    account({
      id: "cc-1",
      kind: "credit",
      subtype: "credit card",
      name: "Plaid Credit Card",
      balanceMinor: 410_00,
    }),
    account({
      id: "cc-2",
      kind: "credit",
      subtype: "credit card",
      name: "Plaid Business Credit Card",
      balanceMinor: 5_020_00,
    }),
    account({ kind: "loan", subtype: "mortgage", name: "Plaid Mortgage", balanceMinor: 56_302_00 }),
    account({
      kind: "loan",
      subtype: "student loan",
      name: "Plaid Student Loan",
      balanceMinor: 65_262_00,
    }),
  ];

  const metrics: KingdomMetrics = {
    emergencyRunwayMonths: 57.4,
    totalHighInterestDebt: usd(5_430_00),
    debtTrajectory: [
      {
        accountId: "cc-1",
        name: "Plaid Credit Card",
        institution: "Tartan Bank",
        currentBalance: usd(410_00),
        delta30d: null,
        delta60d: null,
        delta90d: null,
      },
      {
        accountId: "cc-2",
        name: "Plaid Business Credit Card",
        institution: "Tartan Bank",
        currentBalance: usd(5_020_00),
        delta30d: null,
        delta60d: null,
        delta90d: null,
      },
    ],
    recurringCandidates: [],
    budgetStatus: [],
    // First moon still open: completed month has no data, mtd does.
    completedMonth: month("2026-07", {}, 0, 0),
    priorMonth: month("2026-06", {}, 0, 0),
    mtd: month(
      "2026-08",
      { travel: 500_00, health: 78_50, coffee: 4_33, dining: 12_00, shopping: 89_40 },
      -659_23,
      7,
    ),
  };

  return {
    accounts,
    transactions: [
      txn({
        postedAt: "2026-08-01",
        amountMinor: 4_22,
        category: "income",
        description: "INTRST PYMNT",
      }),
      txn({
        postedAt: "2026-07-11",
        amountMinor: -500_00,
        category: "travel",
        merchant: "United Airlines",
      }),
      txn({
        postedAt: "2026-07-10",
        amountMinor: -4_33,
        category: "coffee",
        merchant: "Starbucks",
      }),
      txn({ postedAt: "2026-07-16", amountMinor: -89_40, category: "shopping", merchant: "FUN" }),
      txn({
        postedAt: "2026-07-05",
        amountMinor: -25_00,
        category: "debt_payment",
        description: "CREDIT CARD 3333 PAYMENT",
      }),
    ],
    events: [],
    metrics,
    today: "2026-08-04",
    ...overrides,
  };
}
