import { describe, expect, it } from "vitest";
import type { PlaidHttp } from "../src/plaid/client.js";
import { createPlaidProvider, dollarsToMinor } from "../src/plaid/provider.js";

// Golden fixture shaped like a real /transactions/sync response. THE test that
// locks the sign convention: Plaid positive = outflow -> platform negative.
const SYNC_RESPONSE = {
  added: [
    {
      account_id: "acct-1",
      transaction_id: "txn-coffee",
      date: "2026-07-14",
      authorized_date: "2026-07-13",
      name: "STARBUCKS STORE 12345",
      merchant_name: "Starbucks",
      amount: 6.33, // Plaid: positive = money OUT
      pending: false,
      personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
    },
    {
      account_id: "acct-1",
      transaction_id: "txn-paycheck",
      date: "2026-07-15",
      name: "ACME CORP PAYROLL",
      amount: -2500.0, // Plaid: negative = money IN
      pending: false,
      personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" },
    },
  ],
  modified: [],
  removed: [{ transaction_id: "txn-gone" }],
  next_cursor: "cursor-2",
  has_more: false,
};

const ACCOUNTS_RESPONSE = {
  accounts: [
    {
      account_id: "acct-1",
      name: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      mask: "1234",
      balances: { current: 2105.5, limit: null },
    },
    {
      account_id: "acct-2",
      name: "Travel Card",
      type: "credit",
      subtype: "credit card",
      mask: "9876",
      balances: { current: 1500.0, limit: 10000.0 },
    },
  ],
};

const fakeClient: PlaidHttp = {
  async post(path) {
    if (path === "/accounts/get") return ACCOUNTS_RESPONSE;
    if (path === "/transactions/sync") return SYNC_RESPONSE;
    throw new Error(`unexpected path ${path}`);
  },
};

describe("PlaidProvider", () => {
  it("flips the sign: Plaid outflow (+) becomes platform outflow (-)", async () => {
    const page = await createPlaidProvider(fakeClient).syncPage("token", null);
    const coffee = page.added.find((t) => t.sourceTxnId === "txn-coffee");
    const paycheck = page.added.find((t) => t.sourceTxnId === "txn-paycheck");
    expect(coffee?.amountMinor).toBe(-633);
    expect(paycheck?.amountMinor).toBe(250_000);
  });

  it("maps sync pages: cursor, removals, categories, dates", async () => {
    const page = await createPlaidProvider(fakeClient).syncPage("token", null);
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.hasMore).toBe(false);
    expect(page.removedSourceTxnIds).toEqual(["txn-gone"]);
    const coffee = page.added[0];
    expect(coffee?.postedAt).toBe("2026-07-14");
    expect(coffee?.authorizedAt).toBe("2026-07-13");
    expect(coffee?.merchant).toBe("Starbucks");
    expect(coffee?.sourceCategoryDetailed).toBe("FOOD_AND_DRINK_COFFEE");
  });

  it("converts account balances from decimal dollars to minor units", async () => {
    const accounts = await createPlaidProvider(fakeClient).fetchAccounts("token");
    expect(accounts[0]?.balanceMinor).toBe(210_550);
    expect(accounts[1]?.balanceMinor).toBe(150_000);
    expect(accounts[1]?.creditLimitMinor).toBe(1_000_000);
    expect(accounts[0]?.kind).toBe("depository");
  });

  it("dollarsToMinor is exact for 2dp inputs", () => {
    expect(dollarsToMinor(0.1)).toBe(10);
    expect(dollarsToMinor(1.005 * 100)).toBe(10_050); // float noise rounds correctly
    expect(dollarsToMinor(-19.99)).toBe(-1999);
  });
});
