import { describe, expect, it } from "vitest";
import {
  type CouncilState,
  type Quest,
  advanceCouncil,
  backProposal,
  generateProposals,
  isoWeekOf,
  readOracle,
} from "../src/model/council";
import type { LedgerEvent } from "../src/model/economy";
import type { KingdomMetrics } from "../src/model/types";

const m = (amountMinor: number) => ({ amountMinor, currency: "USD" });

const metrics = {
  totalHighInterestDebt: m(400_000),
  emergencyRunwayMonths: 2.4,
  recurringCandidates: [{ merchant: "NETFLIX" }],
  investments: {
    contributionsCompletedMonth: m(50_000),
    contributionsPriorMonth: m(50_000),
  },
} as unknown as KingdomMetrics;

let seq = 0;
const ev = (type: string, payload: Record<string, unknown> = {}): LedgerEvent => ({
  seq: ++seq,
  type,
  occurredOn: "2026-08-10",
  payload,
});

describe("isoWeekOf", () => {
  it("computes UTC ISO weeks, including year boundaries", () => {
    expect(isoWeekOf("2026-08-05")).toBe("2026-W32");
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01");
    expect(isoWeekOf("2027-01-01")).toBe("2026-W53"); // Jan 1 2027 is a Friday of ISO week 53/2026
    expect(isoWeekOf("2024-12-30")).toBe("2025-W01"); // Monday belonging to next ISO year
  });
});

describe("generateProposals", () => {
  it("is deterministic per week and every advisor with data speaks", () => {
    const a = generateProposals("2026-W32", metrics);
    const b = generateProposals("2026-W32", metrics);
    expect(a).toEqual(b);
    expect(a.map((p) => p.advisor).sort()).toEqual([
      "builder",
      "captain",
      "guildmaster",
      "treasurer",
    ]);
  });

  it("advisors without verifiable data stay silent; no metrics -> no council", () => {
    const quiet = generateProposals("2026-W32", {
      totalHighInterestDebt: m(0),
      emergencyRunwayMonths: null,
      recurringCandidates: [],
    } as unknown as KingdomMetrics);
    expect(quiet).toEqual([]);
    expect(generateProposals("2026-W32", null)).toEqual([]);
  });

  it("the captain's target is 5% of the debt, clamped and rounded", () => {
    const p = generateProposals("2026-W32", metrics).find((x) => x.advisor === "captain");
    expect(p?.oracle).toEqual({ kind: "debt_paydown", targetMinor: 200_00 }); // 5% of $4,000
    const tiny = generateProposals("2026-W32", {
      ...metrics,
      totalHighInterestDebt: m(50_00),
    } as unknown as KingdomMetrics).find((x) => x.advisor === "captain");
    expect(tiny?.oracle).toEqual({ kind: "debt_paydown", targetMinor: 100_00 }); // $100 floor
  });

  it("the treasurer aims for the next tier when it is near", () => {
    const p = generateProposals("2026-W32", metrics).find((x) => x.advisor === "treasurer");
    expect(p?.oracle).toEqual({ kind: "runway_reach", targetMonths: 3 }); // 2.4 -> tier 3
    const far = generateProposals("2026-W32", {
      ...metrics,
      emergencyRunwayMonths: 3.2,
    } as unknown as KingdomMetrics).find((x) => x.advisor === "treasurer");
    expect(far?.oracle).toEqual({ kind: "runway_reach", targetMonths: 3.7 }); // 6 is far: +0.5
  });
});

describe("readOracle", () => {
  const quest = (oracle: Quest["oracle"], baselineSeq: number): Quest => ({
    id: "q",
    advisor: "captain",
    title: "t",
    charge: "c",
    reward: 250,
    oracle,
    backedAt: "2026-08-05",
    expiresOn: "2026-09-02",
    baselineSeq,
  });

  it("debt paydown sums unflagged decreases inside the window only", () => {
    const before = ev("HIGH_INTEREST_DEBT_DECREASED", { delta: m(100_00) });
    const flagged = ev("HIGH_INTEREST_DEBT_DECREASED", {
      delta: m(500_00),
      accountSetChanged: true,
    });
    const inWindow = ev("HIGH_INTEREST_DEBT_DECREASED", { delta: m(150_00) });
    const q = quest({ kind: "debt_paydown", targetMinor: 200_00 }, before.seq);
    const partial = readOracle(q, metrics, [before, flagged, inWindow]);
    expect(partial.done).toBe(false); // only $150 counts
    expect(partial.progress).toContain("$150.00");
    const more = ev("HIGH_INTEREST_DEBT_DECREASED", { delta: m(60_00) });
    expect(readOracle(q, metrics, [before, flagged, inWindow, more]).done).toBe(true);
  });

  it("runway oracle judges live metrics against the pinned target", () => {
    const q = quest({ kind: "runway_reach", targetMonths: 3 }, 0);
    expect(readOracle(q, metrics, []).done).toBe(false);
    expect(
      readOracle(q, { ...metrics, emergencyRunwayMonths: 3.1 } as unknown as KingdomMetrics, [])
        .done,
    ).toBe(true);
  });

  it("tithe and caravan oracles watch the ledger window", () => {
    const outside = ev("RECURRING_EXPENSE_REMOVED", { merchant: "NETFLIX" });
    const q = quest({ kind: "tithe_dropped" }, outside.seq);
    expect(readOracle(q, metrics, [outside]).done).toBe(false);
    const dropped = ev("RECURRING_EXPENSE_REMOVED", { merchant: "HULU" });
    expect(readOracle(q, metrics, [outside, dropped]).done).toBe(true);
  });
});

describe("advanceCouncil", () => {
  it("first session seats the council; same-week reopen changes nothing", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    expect(first.changed).toBe(true);
    expect(first.council.proposals.length).toBeGreaterThan(0);
    const again = advanceCouncil(first.council, "2026-W32", metrics, [], "2026-08-06", new Set());
    expect(again.changed).toBe(false);
  });

  it("a new week regenerates proposals but active quests survive", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const backed = backProposal(
      first.council,
      first.council.proposals[0]?.id as string,
      10,
      "2026-08-05",
    ) as CouncilState;
    const next = advanceCouncil(backed, "2026-W33", metrics, [], "2026-08-12", new Set());
    expect(next.changed).toBe(true);
    expect(next.council.active).toHaveLength(1);
    expect(next.council.proposals.every((p) => p.id.startsWith("2026-W33"))).toBe(true);
  });

  it("fulfillment grants once (CAS replays cannot double-pay); lapse grants nothing", () => {
    const base = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const capId = "2026-W32:captain";
    const backed = backProposal(base.council, capId, 0, "2026-08-05") as CouncilState;
    const paydown = [ev("HIGH_INTEREST_DEBT_DECREASED", { delta: m(200_00) })];

    const won = advanceCouncil(backed, "2026-W32", metrics, paydown, "2026-08-10", new Set());
    expect(won.grants).toEqual([{ questId: capId, influence: 250, at: "2026-08-10" }]);
    expect(won.council.resolved[0]?.outcome).toBe("fulfilled");

    // Replay on meta that already recorded the grant: no second payment.
    const replay = advanceCouncil(
      backed,
      "2026-W32",
      metrics,
      paydown,
      "2026-08-10",
      new Set([capId]),
    );
    expect(replay.grants).toEqual([]);

    // Lapse: past expiresOn, no grant, resolved without penalty.
    const lapsed = advanceCouncil(backed, "2026-W37", metrics, [], "2026-09-10", new Set());
    expect(lapsed.grants).toEqual([]);
    expect(lapsed.council.resolved[0]?.outcome).toBe("lapsed");
    expect(lapsed.council.active).toEqual([]);
  });
});

describe("review regressions", () => {
  it("an advisor with an active quest stays silent in the new week's slate", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const backed = backProposal(first.council, "2026-W32:captain", 0, "2026-08-05") as CouncilState;
    const next = advanceCouncil(backed, "2026-W33", metrics, [], "2026-08-12", new Set());
    expect(next.council.active.map((q) => q.advisor)).toEqual(["captain"]);
    expect(next.council.proposals.some((p) => p.advisor === "captain")).toBe(false);
    expect(next.council.proposals.length).toBeGreaterThan(0); // others still speak
  });

  it("evidence dated after expiry proves nothing", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const backed = backProposal(first.council, "2026-W32:captain", 0, "2026-08-05") as CouncilState;
    // Paydown occurs months after the 28-day term ended.
    const late: LedgerEvent = {
      seq: 999,
      type: "HIGH_INTEREST_DEBT_DECREASED",
      occurredOn: "2026-12-01",
      payload: { delta: m(500_00) },
    };
    const judged = advanceCouncil(backed, "2026-W49", metrics, [late], "2026-12-02", new Set());
    expect(judged.grants).toEqual([]);
    expect(judged.council.resolved[0]?.outcome).toBe("lapsed");
  });

  it("an expired runway quest lapses even if live runway now meets the target", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const backed = backProposal(
      first.council,
      "2026-W32:treasurer",
      0,
      "2026-08-05",
    ) as CouncilState;
    const richNow = { ...metrics, emergencyRunwayMonths: 8 } as unknown as KingdomMetrics;
    const judged = advanceCouncil(backed, "2026-W49", richNow, [], "2026-12-02", new Set());
    expect(judged.grants).toEqual([]);
    expect(judged.council.resolved[0]?.outcome).toBe("lapsed");
    // ...but within the term, the same reading fulfills.
    const inTime = advanceCouncil(backed, "2026-W32", richNow, [], "2026-08-20", new Set());
    expect(inTime.council.resolved[0]?.outcome).toBe("fulfilled");
  });

  it("a null-metrics open in a new week keeps the stored slate", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const blind = advanceCouncil(first.council, "2026-W33", null, [], "2026-08-12", new Set());
    expect(blind.changed).toBe(false);
    expect(blind.council.proposals).toEqual(first.council.proposals);
    expect(blind.council.week).toBe("2026-W32"); // rolls later, WITH metrics
  });
});

describe("backProposal", () => {
  it("pins the baseline and removes the proposal; unknown ids refuse", () => {
    const first = advanceCouncil(undefined, "2026-W32", metrics, [], "2026-08-05", new Set());
    const id = first.council.proposals[0]?.id as string;
    const backed = backProposal(first.council, id, 42, "2026-08-05");
    expect(backed).not.toBeNull();
    expect(backed?.active[0]?.baselineSeq).toBe(42);
    expect(backed?.active[0]?.expiresOn).toBe("2026-09-02");
    expect(backed?.proposals.find((p) => p.id === id)).toBeUndefined();
    expect(backProposal(backed as CouncilState, "nope", 42, "2026-08-05")).toBeNull();
  });
});
