import { describe, expect, it } from "vitest";
import { foundMeta } from "../src/model/economy";
import {
  type KingdomMetaWithRoads,
  QUIET_GRACE_DAYS,
  ROLE_CATALOG,
  type RoadRegistry,
  assignRole,
  carryRegistryAcrossFlee,
  clearRole,
  computeRoads,
} from "../src/model/roads";
import type { KingdomInput, KingdomMetrics } from "../src/model/types";
import { account, sandboxInput, txn, usd } from "./fixtures";

const TODAY = "2026-08-04";

const candidate = (overrides: Record<string, unknown>) => ({
  merchant: "NETFLIX",
  averageAmount: usd(17_99),
  averageGapDays: 30,
  lastSeen: "2026-07-20", // +30 -> 2026-08-19, 15 days out from TODAY
  hits: 4,
  ...overrides,
});

function roadsInput(overrides?: Partial<KingdomInput>): KingdomInput {
  return sandboxInput({
    accounts: [],
    transactions: [],
    metrics: { recurringCandidates: [candidate({})] } as unknown as KingdomMetrics,
    today: TODAY,
    ...overrides,
  });
}

describe("computeRoads — recurring travelers", () => {
  it("is deterministic and silent without data", () => {
    const input = roadsInput();
    expect(computeRoads(input, undefined)).toEqual(computeRoads(input, undefined));
    const empty = roadsInput({ metrics: null, accounts: [] });
    expect(computeRoads(empty, undefined).travelers).toEqual([]);
  });

  it("ETA = lastSeen + rounded gap, in kingdom voice", () => {
    const [t] = computeRoads(roadsInput(), undefined).travelers;
    expect(t?.etaDays).toBe(15);
    expect(t?.arrivesOn).toBe("2026-08-19");
    expect(t?.status).toBe("approaching");
    expect(t?.arrivalCopy).toBe("arrives in 15 days — the 19th of August");
    expect(t?.cadence).toBe("comes every 30 days or so");
    expect(t?.amount).toEqual(usd(17_99));
  });

  it("at the gates at 0; tomorrow at 1", () => {
    const gates = roadsInput({
      metrics: {
        recurringCandidates: [candidate({ lastSeen: "2026-07-05" })], // +30 = today
      } as unknown as KingdomMetrics,
    });
    expect(computeRoads(gates, undefined).travelers[0]?.status).toBe("at-gates");
    expect(computeRoads(gates, undefined).travelers[0]?.arrivalCopy).toBe("at the gates today");
    const tomorrow = roadsInput({
      metrics: {
        recurringCandidates: [candidate({ lastSeen: "2026-07-06" })],
      } as unknown as KingdomMetrics,
    });
    expect(computeRoads(tomorrow, undefined).travelers[0]?.arrivalCopy).toBe("arrives tomorrow");
  });

  it("a passed arrival goes quiet with honest copy, then leaves after the grace", () => {
    const quiet = roadsInput({
      metrics: {
        recurringCandidates: [candidate({ lastSeen: "2026-07-01" })], // +30 = Jul 31, 4 days ago
      } as unknown as KingdomMetrics,
    });
    const [t] = computeRoads(quiet, undefined).travelers;
    expect(t?.status).toBe("quiet");
    expect(t?.arrivalCopy).toBe("expected 4 days ago — the road has gone quiet");

    const edge = roadsInput({
      metrics: {
        // +30 lands exactly QUIET_GRACE_DAYS ago — still shown.
        recurringCandidates: [candidate({ lastSeen: "2026-06-25" })],
      } as unknown as KingdomMetrics,
    });
    expect(computeRoads(edge, undefined).travelers).toHaveLength(1);

    const gone = roadsInput({
      metrics: {
        recurringCandidates: [candidate({ lastSeen: "2026-06-24" })], // 11 days past
      } as unknown as KingdomMetrics,
    });
    expect(computeRoads(gone, undefined).travelers).toEqual([]);
    expect(QUIET_GRACE_DAYS).toBe(10);
  });

  it("malformed runtime candidates are skipped, never guessed", () => {
    const input = roadsInput({
      metrics: {
        recurringCandidates: [
          candidate({ lastSeen: undefined }),
          candidate({ merchant: 42 }),
          candidate({ averageGapDays: Number.NaN }),
        ],
      } as unknown as KingdomMetrics,
    });
    expect(computeRoads(input, undefined).travelers).toEqual([]);
  });

  it("default roles come from the merchant's dominant category; never by-decree roles", () => {
    const input = roadsInput({
      transactions: [
        txn({
          postedAt: "2026-07-20",
          amountMinor: -17_99,
          merchant: "NETFLIX",
          category: "entertainment",
        }),
        txn({
          postedAt: "2026-06-20",
          amountMinor: -17_99,
          merchant: "NETFLIX",
          category: "entertainment",
        }),
      ],
    });
    const [t] = computeRoads(input, undefined).travelers;
    expect(t?.role).toBe("players");
    expect(t?.roleAssigned).toBe(false);

    const unknown = computeRoads(roadsInput(), undefined).travelers[0];
    expect(unknown?.role).toBe("visitor");
    const decreeOnly = new Set(ROLE_CATALOG.filter((r) => r.byDecreeOnly).map((r) => r.id));
    expect(decreeOnly.has((t?.role ?? "visitor") as never)).toBe(false);
  });
});

describe("computeRoads — due-date travelers", () => {
  const card = account({
    id: "cc-1",
    kind: "credit",
    subtype: "credit card",
    name: "Sapphire",
    institution: "Chase",
    balanceMinor: 4_000_00,
    nextDueDate: "2026-08-11",
    minPayment: usd(40_00),
  });

  it("bank due dates become collectors with exact ETAs", () => {
    const input = roadsInput({ metrics: null, accounts: [card] });
    const [t] = computeRoads(input, undefined).travelers;
    expect(t?.id).toBe("due:cc-1");
    expect(t?.name).toBe("Chase collector");
    expect(t?.role).toBe("collectors");
    expect(t?.etaDays).toBe(7);
    expect(t?.amount).toEqual(usd(40_00));
    expect(t?.cadence).toBe("a due date the bank has set");
  });

  it("overdue is loud, never hidden; missing minPayment means no amount", () => {
    const overdue = { ...card, nextDueDate: "2026-08-01", isOverdue: true };
    const { minPayment: _, ...noMin } = overdue;
    const input = roadsInput({ metrics: null, accounts: [noMin as typeof card] });
    const [t] = computeRoads(input, undefined).travelers;
    expect(t?.status).toBe("overdue");
    expect(t?.arrivalCopy).toBe("waits at the gates — the due date is 3 days past");
    expect(t?.amount).toBeUndefined();
  });

  it("mortgages default to the Crown Tax Collector; zero balances are excluded", () => {
    const mortgage = account({
      id: "mort-1",
      kind: "loan",
      subtype: "mortgage",
      name: "Home Loan",
      institution: "Rocket Mortgage",
      balanceMinor: 250_000_00,
      nextDueDate: "2026-08-21",
      minPayment: usd(1_900_00),
    });
    const paid = account({
      id: "cc-paid",
      kind: "credit",
      subtype: "credit card",
      name: "Paid Card",
      balanceMinor: 0,
      nextDueDate: "2026-08-11",
    });
    const input = roadsInput({ metrics: null, accounts: [mortgage, paid] });
    const travelers = computeRoads(input, undefined).travelers;
    expect(travelers).toHaveLength(1);
    expect(travelers[0]?.role).toBe("taxcollector");
  });
});

describe("computeRoads — income travelers and sorting", () => {
  it("income candidates arrive as the Royal Provisioner", () => {
    const input = roadsInput({
      metrics: {
        recurringCandidates: [],
        incomeCandidates: [
          candidate({
            merchant: "ACME PAYROLL",
            averageAmount: usd(2_400_00),
            averageGapDays: 14,
            lastSeen: "2026-07-28",
          }),
        ],
      } as unknown as KingdomMetrics,
    });
    const [t] = computeRoads(input, undefined).travelers;
    expect(t?.id).toBe("income:ACME PAYROLL");
    expect(t?.role).toBe("provisioner");
    expect(t?.tone).toBe("friendly");
    expect(t?.etaDays).toBe(7);
  });

  it("sorts by ETA ascending (quiet/overdue first), amount as tiebreak", () => {
    const input = roadsInput({
      accounts: [
        account({
          id: "cc-1",
          kind: "credit",
          subtype: "credit card",
          name: "Card",
          balanceMinor: 100_00,
          nextDueDate: "2026-08-02", // overdue, eta -2
          minPayment: usd(25_00),
        }),
      ],
      metrics: {
        recurringCandidates: [
          candidate({ merchant: "SMALL", averageAmount: usd(5_00), lastSeen: "2026-07-10" }), // eta 5
          candidate({ merchant: "BIG", averageAmount: usd(80_00), lastSeen: "2026-07-10" }), // eta 5
        ],
      } as unknown as KingdomMetrics,
    });
    const ids = computeRoads(input, undefined).travelers.map((t) => t.id);
    expect(ids).toEqual(["due:cc-1", "merchant:BIG", "merchant:SMALL"]);
  });
});

describe("the Road Registry", () => {
  const registry: RoadRegistry = {
    registryVersion: 1,
    assignments: { "merchant:NETFLIX": "parasite" },
  };

  it("an assignment wins over the default; unknown stored roles fall back", () => {
    const [named] = computeRoads(roadsInput(), registry).travelers;
    expect(named?.role).toBe("parasite");
    expect(named?.roleAssigned).toBe(true);
    expect(named?.tone).toBe("hostile");

    const future = {
      registryVersion: 1,
      assignments: { "merchant:NETFLIX": "dragonrider" },
    } as unknown as RoadRegistry;
    const [fallback] = computeRoads(roadsInput(), future).travelers;
    expect(fallback?.role).toBe("visitor");
    expect(fallback?.roleAssigned).toBe(false);
  });

  it("assignRole/clearRole are pure, spread-preserving, and null on no-ops", () => {
    const meta = foundMeta(0, null, "2026-08-04T00:00:00Z");
    const assigned = assignRole(meta, "merchant:NETFLIX", "players");
    expect(assigned).not.toBeNull();
    expect((assigned as KingdomMetaWithRoads).roadRegistry?.assignments["merchant:NETFLIX"]).toBe(
      "players",
    );
    expect(assigned?.endowment).toBe(meta.endowment); // unrelated fields survive

    // No-op re-assign and unknown role both refuse the write.
    expect(assignRole(assigned as never, "merchant:NETFLIX", "players")).toBeNull();
    expect(assignRole(meta, "merchant:NETFLIX", "dragonrider" as never)).toBeNull();

    const cleared = clearRole(assigned as never, "merchant:NETFLIX");
    expect((cleared as KingdomMetaWithRoads).roadRegistry?.assignments).toEqual({});
    expect(clearRole(meta, "merchant:NETFLIX")).toBeNull();
  });

  it("the registry survives a flee; the council does not", () => {
    const oldMeta = {
      ...foundMeta(0, null, "2026-01-01T00:00:00Z"),
      roadRegistry: registry,
      council: { week: "2026-W01", proposals: [], active: [], resolved: [] },
    } as KingdomMetaWithRoads;
    const newMeta = carryRegistryAcrossFlee(
      oldMeta,
      foundMeta(500, null, "2026-08-04T00:00:00Z", 1),
    ) as KingdomMetaWithRoads & { council?: unknown };
    expect(newMeta.roadRegistry).toEqual(registry);
    expect(newMeta.council).toBeUndefined();
    // No registry -> new meta passes through unchanged.
    const bare = foundMeta(500, null, "2026-08-04T00:00:00Z", 1);
    expect(carryRegistryAcrossFlee(foundMeta(0, null, "t"), bare)).toBe(bare);
  });
});
