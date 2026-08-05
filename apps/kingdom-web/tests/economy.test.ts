import { describe, expect, it } from "vitest";
import {
  CATALOG_VERSION,
  DEBT_ELIMINATED_INFLUENCE,
  type LedgerEvent,
  computeEndowment,
  foldInfluence,
  foundMeta,
  influenceBalance,
  purchase,
} from "../src/model/economy";
import type { KingdomMetrics } from "../src/model/types";

let seq = 0;
const ev = (
  type: string,
  payload: Record<string, unknown>,
  occurredOn = "2026-08-01",
): LedgerEvent => ({
  seq: ++seq,
  type,
  occurredOn,
  payload,
});
const m = (amountMinor: number) => ({ amountMinor, currency: "USD" });

describe("foldInfluence", () => {
  it("is deterministic and order-independent", () => {
    const events = [
      ev("EMERGENCY_FUND_MILESTONE", { tier: 3 }),
      ev("NET_CASH_FLOW_POSITIVE", { month: "2026-07", netFlow: m(50_000) }),
      ev("GOAL_COMPLETED", { goalId: "g1" }),
    ];
    const a = foldInfluence(events, 0);
    const b = foldInfluence([...events].reverse(), 0);
    expect(a.influence).toBe(b.influence);
    expect(a.influence).toBe(500 + 50 + 500);
  });

  it("one-time grants dedup per key; proportional grants dedup by natural key", () => {
    const events = [
      ev("EMERGENCY_FUND_MILESTONE", { tier: 3 }),
      ev("EMERGENCY_FUND_MILESTONE", { tier: 3 }), // re-crossed after a dip
      ev("NET_CASH_FLOW_POSITIVE", { month: "2026-07", netFlow: m(50_000) }),
      ev("NET_CASH_FLOW_POSITIVE", { month: "2026-07", netFlow: m(50_000) }), // dup month
      ev("NET_CASH_FLOW_POSITIVE", { month: "2026-06", netFlow: m(50_000) }), // new month
    ];
    const fold = foldInfluence(events, 0);
    expect(fold.grants.filter((g) => g.key === "fund:3")).toHaveLength(1);
    expect(fold.influence).toBe(500 + 50 + 50);
  });

  it("respects the epoch cursor — nothing crosses foundedAt", () => {
    const before = ev("DEBT_ELIMINATED", { previous: m(100_000) });
    const after = ev("GOAL_COMPLETED", { goalId: "g1" });
    const fold = foldInfluence([before, after], before.seq);
    expect(fold.influence).toBe(500);
    expect(fold.grants.map((g) => g.key)).toEqual(["oath:g1"]);
  });

  it("events flagged accountSetChanged earn nothing", () => {
    const fold = foldInfluence(
      [
        ev("HIGH_INTEREST_DEBT_DECREASED", {
          delta: m(100_000),
          accountSetChanged: true,
        }),
      ],
      0,
    );
    expect(fold.influence).toBe(0);
  });

  it("caps proportional grants", () => {
    const surplus = foldInfluence(
      [ev("NET_CASH_FLOW_POSITIVE", { month: "2026-07", netFlow: m(10_000_000) })],
      0,
    );
    expect(surplus.influence).toBe(150);
    const paydown = foldInfluence(
      [ev("HIGH_INTEREST_DEBT_DECREASED", { delta: m(10_000_000) })],
      0,
    );
    expect(paydown.influence).toBe(300);
  });
});

describe("computeEndowment", () => {
  const metrics = {
    emergencyRunwayMonths: 3.5,
    savingsRate: { monthsCounted: 3, pct: 12 },
    totalHighInterestDebt: m(50_000),
  } as unknown as KingdomMetrics;

  it("grants currently-held tiers at reduced value with evidence", () => {
    const e = computeEndowment(metrics);
    const kinds = e.grants.map((g) => g.kind).sort();
    expect(kinds).toEqual(["fund:1", "fund:3", "rate:10", "rate:5"]);
    // 25% of 250 + 500 + 250 + 500
    expect(e.influence).toBe(63 + 125 + 63 + 125);
    expect(e.grants[0]?.evidence).toContain("at founding");
  });

  it("debt-free at founding endows; debt held does not", () => {
    const debtFree = computeEndowment({
      ...metrics,
      totalHighInterestDebt: m(0),
    } as unknown as KingdomMetrics);
    expect(debtFree.grants.some((g) => g.kind === "debtgone")).toBe(true);
    expect(debtFree.grants.find((g) => g.kind === "debtgone")?.influence).toBe(
      Math.round(DEBT_ELIMINATED_INFLUENCE * 0.25),
    );
    expect(computeEndowment(metrics).grants.some((g) => g.kind === "debtgone")).toBe(false);
  });

  it("no metrics -> empty endowment", () => {
    expect(computeEndowment(null).influence).toBe(0);
  });
});

describe("purchase and balance", () => {
  const meta = foundMeta(0, null, "2026-08-05T00:00:00Z");
  const fold = foldInfluence([ev("GOAL_COMPLETED", { goalId: "g1" })], 0); // 500

  it("balance follows the ledger equation", () => {
    expect(influenceBalance(meta, fold)).toBe(500);
    const bought = purchase(meta, "title-thrifty", 500, "2026-08-05T01:00:00Z");
    expect(bought).not.toBeNull();
    if (bought !== null) {
      expect(influenceBalance(bought, fold)).toBe(200);
      expect(bought.unlocks).toEqual(["title-thrifty"]);
      expect(bought.spends[0]?.catalogVersion).toBe(CATALOG_VERSION);
    }
  });

  it("refuses unaffordable, unknown, and duplicate purchases", () => {
    expect(purchase(meta, "title-debtslayer", 500, "t")).toBeNull(); // costs 1000
    expect(purchase(meta, "nonsense", 500, "t")).toBeNull();
    const owned = purchase(meta, "banner-crimson", 500, "t");
    expect(owned !== null && purchase(owned, "banner-crimson", 500, "t")).toBeNull();
  });

  it("monuments buy through the same gates as any cosmetic", () => {
    expect(purchase(meta, "monument-founder", 500, "t")).toBeNull(); // costs 800
    const built = purchase(meta, "monument-wellspring", 500, "2026-08-05T02:00:00Z");
    expect(built).not.toBeNull();
    if (built !== null) {
      expect(built.unlocks).toEqual(["monument-wellspring"]);
      expect(purchase(built, "monument-wellspring", 5000, "t")).toBeNull(); // once, ever
    }
  });
});

describe("flee", () => {
  it("a new reign starts from the endowment only — nothing crosses foundedAt", () => {
    const oldReign = foundMeta(0, null, "2026-01-01T00:00:00Z");
    const spent = purchase(
      { ...oldReign, questGrants: [{ questId: "q", influence: 100, at: "t" }] },
      "banner-crimson",
      100_000,
      "t",
    );
    expect(spent).not.toBeNull();
    const newReign = foundMeta(500, null, "2026-08-05T00:00:00Z", oldReign.epoch.fleeCount + 1);
    expect(newReign.spends).toEqual([]);
    expect(newReign.unlocks).toEqual([]);
    expect(newReign.questGrants).toEqual([]);
    expect(newReign.epoch.fleeCount).toBe(1);
    expect(newReign.epoch.epochSeq).toBe(500);
    // Old-reign events fold to zero under the new epoch.
    expect(
      foldInfluence(
        [{ seq: 400, type: "GOAL_COMPLETED", occurredOn: "d", payload: { goalId: "g" } }],
        500,
      ).influence,
    ).toBe(0);
  });
});
