import { describe, expect, it } from "vitest";
import { renderDigest, renderEventLine } from "../src/digest.js";

const money = (amountMinor: number) => ({ amountMinor, currency: "USD" });

describe("renderEventLine", () => {
  it("renders every vocabulary entry with its numbers", () => {
    expect(
      renderEventLine({
        type: "GOAL_OFF_TRACK",
        occurredOn: "2026-08-04",
        expected: money(144_667),
        actual: money(80_000),
        shortfall: money(64_667),
      }),
    ).toBe("Goal off track: expected $1,446.67 by now, actual $800.00 — $646.67 short.");

    expect(
      renderEventLine({
        type: "NET_CASH_FLOW_NEGATIVE",
        occurredOn: "2026-08-04",
        month: "2026-07",
        netFlow: money(-10_000),
      }),
    ).toBe("2026-07: net cash flow negative — $100.00 more out than in.");

    expect(
      renderEventLine({
        type: "RECURRING_EXPENSE_ADDED",
        occurredOn: "2026-08-04",
        merchant: "Netflix",
        estimatedMonthly: money(15_49),
      }),
    ).toBe("New recurring charge: Netflix (~$15.49/mo).");

    expect(
      renderEventLine({
        type: "EMERGENCY_RUNWAY_CHANGED",
        occurredOn: "2026-08-04",
        previousMonths: 4.2,
        currentMonths: 3.1,
      }),
    ).toBe("Emergency runway changed: 4.2 -> 3.1 months.");
  });

  it("falls back gracefully for unknown types", () => {
    expect(renderEventLine({ type: "SOMETHING_NEW", occurredOn: "2026-08-04" })).toBe(
      "SOMETHING_NEW (2026-08-04)",
    );
  });
});

describe("renderDigest", () => {
  it("returns null for an empty day", () => {
    expect(renderDigest("2026-08-04", [])).toBeNull();
  });

  it("builds subject, text, and escaped html", () => {
    const digest = renderDigest("2026-08-04", [
      {
        type: "RECURRING_EXPENSE_ADDED",
        occurredOn: "2026-08-04",
        merchant: "A<B & Sons",
        estimatedMonthly: money(9_99),
      },
    ]);
    expect(digest?.subject).toBe("Your money: 1 thing worth knowing (2026-08-04)");
    expect(digest?.text).toContain("- New recurring charge: A<B & Sons");
    expect(digest?.html).toContain("A&lt;B &amp; Sons");
    expect(digest?.html).not.toContain("A<B");
  });

  it("pluralizes the subject", () => {
    const digest = renderDigest("2026-08-04", [
      { type: "X", occurredOn: "2026-08-04" },
      { type: "Y", occurredOn: "2026-08-04" },
    ]);
    expect(digest?.subject).toBe("Your money: 2 things worth knowing (2026-08-04)");
  });
});
