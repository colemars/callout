import { describe, expect, it } from "vitest";
import { parseAppleCardCsv } from "../src/csv/apple.js";

const CSV = `Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By
07/02/2026,07/03/2026,"ACME MARKET, INC.",Acme Market,Grocery,Purchase,84.12,Cole Marsteller
07/05/2026,07/05/2026,ACH DEPOSIT INTERNET TRANSFER,Apple Card,Payment,Payment,-500.00,Cole Marsteller
07/09/2026,07/10/2026,"QUOTED ""NAME"" VENDOR",Vendor,Shopping,Purchase,19.99,Cole Marsteller
`;

describe("parseAppleCardCsv", () => {
  it("parses rows including quoted commas and escaped quotes", () => {
    const rows = parseAppleCardCsv(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.transactionDate).toBe("2026-07-02");
    expect(rows[0]?.description).toBe("ACME MARKET, INC.");
    expect(rows[0]?.amountRaw).toBe("84.12");
    expect(rows[1]?.type).toBe("Payment");
    expect(rows[1]?.amountRaw).toBe("-500.00");
    expect(rows[2]?.description).toBe('QUOTED "NAME" VENDOR');
  });

  it("hashes identifying fields into a stable sourceTxnId", () => {
    const [a] = parseAppleCardCsv(CSV);
    const [b] = parseAppleCardCsv(CSV);
    expect(a?.sourceTxnId).toBe(b?.sourceTxnId);
    expect(a?.sourceTxnId).toMatch(/^[0-9a-f]{64}$/);
    const ids = parseAppleCardCsv(CSV).map((r) => r.sourceTxnId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a CSV without the expected header", () => {
    expect(() => parseAppleCardCsv("Date,Amount\n01/01/2026,5.00\n")).toThrow(/missing/);
  });
});
