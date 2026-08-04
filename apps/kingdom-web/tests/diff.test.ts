import { describe, expect, it } from "vitest";
import { translate } from "../src/lib/translate";
import { computeKingdomDiff } from "../src/model/diff";
import { kingdomModel } from "../src/model/kingdomModel";
import { month, sandboxInput, txn, usd } from "./fixtures";

const baseState = () => kingdomModel(sandboxInput(), translate);

describe("computeKingdomDiff", () => {
  it("identity: diff(s, s) === []", () => {
    const s = baseState();
    expect(computeKingdomDiff(s, s)).toEqual([]);
  });

  it("orders resolutions before new problems and detects the full transition", () => {
    const prev = baseState();

    // The realm fortifies: bandits paid off, runway grows, month closes positive.
    const input = sandboxInput();
    input.metrics = {
      ...input.metrics,
      totalHighInterestDebt: usd(0),
      debtTrajectory: [],
      emergencyRunwayMonths: 8,
      completedMonth: month("2026-07", { housing: 2_000_00, groceries: 600_00 }, 900_00),
      priorMonth: month("2026-06", { housing: 2_000_00, groceries: 600_00 }, 700_00),
    };
    input.accounts = input.accounts.filter((a) => a.kind !== "credit");
    const next = kingdomModel(input, translate);

    const deltas = computeKingdomDiff(prev, next);
    const types = deltas.map((d) => d.type);

    expect(types).toContain("AGE_ADVANCED");
    expect(types).toContain("THREAT_ENDED"); // bandits driven out
    expect(types).toContain("STRUCTURE_REMOVED"); // bandit camp gone
    expect(types).toContain("MOAT_CHANGED"); // cap released

    // Resolutions land before new problems.
    expect(types.indexOf("THREAT_ENDED")).toBeLessThan(
      types.includes("THREAT_STARTED") ? types.indexOf("THREAT_STARTED") : types.length,
    );
    // Age comes first.
    expect(types[0]).toBe("AGE_ADVANCED");

    const moat = deltas.find((d) => d.type === "MOAT_CHANGED");
    if (moat?.type === "MOAT_CHANGED") {
      expect(moat.from).toBe(74);
      expect(moat.to).toBeGreaterThan(74);
    }
  });

  it("emits RESOURCE_VALUE_CHANGED with magnitude when level holds", () => {
    const prev = baseState();
    const input = sandboxInput();
    // Grow the money market slightly: gold value changes, level stays 5.
    input.accounts = input.accounts.map((a) =>
      a.name === "Plaid Money Market" ? { ...a, balance: usd(43_500_00) } : a,
    );
    const next = kingdomModel(input, translate);
    const deltas = computeKingdomDiff(prev, next);
    const gold = deltas.find((d) => d.type === "RESOURCE_VALUE_CHANGED" && d.key === "gold");
    expect(gold).toBeDefined();
    if (gold?.type === "RESOURCE_VALUE_CHANGED") {
      expect(gold.toValue - gold.fromValue).toBe(300_00);
      expect(gold.pctChange).toBeCloseTo(0.5, 1);
    }
    expect(deltas.some((d) => d.type === "RESOURCE_LEVEL_CHANGED")).toBe(false);
  });

  it("emits CHRONICLE_NEW only for unseen refIds", () => {
    const prev = baseState();
    const input = sandboxInput();
    input.transactions = [
      ...input.transactions,
      txn({
        id: "txn-new-paycheck",
        postedAt: "2026-08-03",
        amountMinor: 500_000,
        category: "income",
        merchant: "ACME PAYROLL",
      }),
    ];
    const next = kingdomModel(input, translate);
    const news = computeKingdomDiff(prev, next).filter((d) => d.type === "CHRONICLE_NEW");
    expect(news).toHaveLength(1);
    if (news[0]?.type === "CHRONICLE_NEW") {
      expect(news[0].entry.refId).toBe("txn-new-paycheck");
      expect(news[0].entry.headline).toContain("tax collectors");
    }
  });

  it("detects threat severity changes", () => {
    const prev = baseState();
    const input = sandboxInput();
    input.metrics = { ...input.metrics, totalHighInterestDebt: usd(15_000_00) };
    const next = kingdomModel(input, translate);
    const deltas = computeKingdomDiff(prev, next);
    const sev = deltas.find((d) => d.type === "THREAT_SEVERITY_CHANGED");
    expect(sev).toBeDefined();
    if (sev?.type === "THREAT_SEVERITY_CHANGED") {
      expect(sev.from).toBe(2);
      expect(sev.to).toBe(3);
    }
  });
});
