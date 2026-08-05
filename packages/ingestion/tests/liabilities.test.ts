import { describe, expect, it } from "vitest";
import { createPlaidLiabilitiesProvider, pickCreditApr } from "../src/liabilities/provider.js";
import type { PlaidHttp } from "../src/plaid/client.js";

// Golden fixture: a trimmed /liabilities/get response — one card with several
// APRs, one student loan, one mortgage, one card with no APRs reported.
const FIXTURE = {
  liabilities: {
    credit: [
      {
        account_id: "ext-card",
        aprs: [
          { apr_percentage: 27.24, apr_type: "cash_apr" },
          { apr_percentage: 24.99, apr_type: "purchase_apr" },
          { apr_percentage: 0, apr_type: "balance_transfer_apr" },
        ],
        is_overdue: false,
        last_payment_amount: 500.5,
        minimum_payment_amount: 125.25,
        next_payment_due_date: "2026-08-27",
      },
      {
        account_id: "ext-card-shy",
        aprs: [],
        is_overdue: null,
        last_payment_amount: null,
        minimum_payment_amount: null,
        next_payment_due_date: null,
      },
    ],
    student: [
      {
        account_id: "ext-student",
        interest_rate_percentage: 5.05,
        is_overdue: false,
        minimum_payment_amount: 320,
        next_payment_due_date: "2026-09-01",
      },
    ],
    mortgage: [
      {
        account_id: "ext-mortgage",
        interest_rate: { percentage: 6.375, type: "fixed" },
        next_monthly_payment: 2100.75,
        next_payment_due_date: "2026-09-01",
      },
    ],
  },
};

const fakeClient = (resp: unknown): PlaidHttp => ({
  async post(path) {
    expect(path).toBe("/liabilities/get");
    return resp as Record<string, unknown>;
  },
});

describe("createPlaidLiabilitiesProvider", () => {
  it("maps all three kinds; APR as basis points; silence when the bank reports none", async () => {
    const rows = await createPlaidLiabilitiesProvider(fakeClient(FIXTURE)).fetchLiabilities("t");
    expect(rows).toHaveLength(4);

    const card = rows.find((r) => r.externalAccountId === "ext-card");
    expect(card).toEqual({
      externalAccountId: "ext-card",
      kind: "credit",
      aprBps: 2499, // purchase APR preferred over the higher cash APR
      aprType: "purchase_apr",
      minPaymentMinor: 125_25,
      nextDueDate: "2026-08-27",
      isOverdue: false,
      lastPaymentMinor: 500_50,
    });

    const shy = rows.find((r) => r.externalAccountId === "ext-card-shy");
    expect(shy).toEqual({ externalAccountId: "ext-card-shy", kind: "credit" });

    const student = rows.find((r) => r.externalAccountId === "ext-student");
    expect(student?.aprBps).toBe(505);
    expect(student?.kind).toBe("student");

    const mortgage = rows.find((r) => r.externalAccountId === "ext-mortgage");
    expect(mortgage?.aprBps).toBe(638); // 6.375% -> 637.5 -> rounds to 638
    expect(mortgage?.minPaymentMinor).toBe(2_100_75);
  });

  it("tolerates null arrays", async () => {
    const rows = await createPlaidLiabilitiesProvider(
      fakeClient({ liabilities: { credit: null, student: null, mortgage: null } }),
    ).fetchLiabilities("t");
    expect(rows).toEqual([]);
  });
});

describe("pickCreditApr", () => {
  it("prefers the purchase APR, falls back to the highest, null when none", () => {
    expect(
      pickCreditApr([
        { apr_percentage: 29.99, apr_type: "cash_apr" },
        { apr_percentage: 24.99, apr_type: "purchase_apr" },
      ]),
    ).toEqual({ aprBps: 2499, aprType: "purchase_apr" });
    expect(
      pickCreditApr([
        { apr_percentage: 19.99, apr_type: "cash_apr" },
        { apr_percentage: 29.99, apr_type: "special" },
      ]),
    ).toEqual({ aprBps: 2999, aprType: "special" });
    expect(pickCreditApr([{ apr_percentage: null, apr_type: "purchase_apr" }])).toBeNull();
    expect(pickCreditApr([])).toBeNull();
  });
});
