import { describe, expect, it } from "vitest";
import {
  createPlaidInvestmentsProvider,
  mapPlaidInvestmentKind,
} from "../src/investments/provider.js";
import type { PlaidHttp } from "../src/plaid/client.js";

// Golden fixture shaped like a real /investments/transactions/get response.
// THE test that locks the investments sign convention: Plaid positive = cash
// LEAVES the account's cash balance -> platform positive = cash INTO the account.
const RESPONSE = {
  investment_transactions: [
    {
      investment_transaction_id: "ivt-contribution",
      account_id: "acct-401k",
      security_id: null,
      date: "2026-07-15",
      name: "EMPLOYEE CONTRIBUTION",
      type: "cash",
      subtype: "contribution",
      amount: -650.0, // Plaid: cash credited to the account
      quantity: null,
    },
    {
      investment_transaction_id: "ivt-dividend",
      account_id: "acct-401k",
      security_id: "sec-vtsax",
      date: "2026-07-20",
      name: "VTSAX DIVIDEND",
      type: "cash",
      subtype: "dividend",
      amount: -42.17,
      quantity: null,
    },
    {
      investment_transaction_id: "ivt-buy",
      account_id: "acct-401k",
      security_id: "sec-vtsax",
      date: "2026-07-21",
      name: "BUY VTSAX",
      type: "buy",
      subtype: "buy",
      amount: 692.17, // Plaid: cash debited to purchase shares
      quantity: 5.432,
    },
  ],
  securities: [{ security_id: "sec-vtsax", ticker_symbol: "VTSAX" }],
  total_investment_transactions: 3,
};

const fakeClient: PlaidHttp = {
  async post(path, body) {
    if (path !== "/investments/transactions/get") throw new Error(`unexpected ${path}`);
    const options = body.options as { offset: number };
    return options.offset === 0
      ? RESPONSE
      : { investment_transactions: [], securities: [], total_investment_transactions: 3 };
  },
};

describe("PlaidInvestmentsProvider", () => {
  it("flips the sign: contributions and dividends are positive (cash in)", async () => {
    const activity = await createPlaidInvestmentsProvider(fakeClient).fetchActivity(
      "token",
      "2026-05-01" as never,
      "2026-08-01" as never,
    );
    const byId = new Map(activity.map((a) => [a.sourceActivityId, a]));
    expect(byId.get("ivt-contribution")?.amountMinor).toBe(65_000);
    expect(byId.get("ivt-contribution")?.kind).toBe("contribution");
    expect(byId.get("ivt-dividend")?.amountMinor).toBe(4_217);
    expect(byId.get("ivt-dividend")?.kind).toBe("dividend");
    expect(byId.get("ivt-buy")?.amountMinor).toBe(-69_217); // buying spends cash
    expect(byId.get("ivt-buy")?.kind).toBe("buy");
  });

  it("resolves tickers and keeps share quantities as text", async () => {
    const activity = await createPlaidInvestmentsProvider(fakeClient).fetchActivity(
      "token",
      "2026-05-01" as never,
      "2026-08-01" as never,
    );
    const buy = activity.find((a) => a.sourceActivityId === "ivt-buy");
    expect(buy?.ticker).toBe("VTSAX");
    expect(buy?.quantity).toBe("5.432");
    const contribution = activity.find((a) => a.sourceActivityId === "ivt-contribution");
    expect(contribution?.ticker).toBeUndefined();
  });

  it("maps Plaid type/subtype pairs to platform kinds", () => {
    expect(mapPlaidInvestmentKind("cash", "contribution")).toBe("contribution");
    expect(mapPlaidInvestmentKind("cash", "deposit")).toBe("contribution");
    expect(mapPlaidInvestmentKind("cash", "dividend")).toBe("dividend");
    expect(mapPlaidInvestmentKind("cash", "qualified dividend")).toBe("dividend");
    expect(mapPlaidInvestmentKind("cash", "interest")).toBe("interest");
    expect(mapPlaidInvestmentKind("buy", "buy")).toBe("buy");
    expect(mapPlaidInvestmentKind("sell", "sell")).toBe("sell");
    expect(mapPlaidInvestmentKind("fee", "management fee")).toBe("other");
  });
});
