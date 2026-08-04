import { describe, expect, it } from "vitest";
import { translate } from "../src/lib/translate";
import { kingdomModel } from "../src/model/kingdomModel";
import { month, sandboxInput, txn, usd } from "./fixtures";

describe("kingdomModel on the day-one sandbox (the sanity story)", () => {
  const state = kingdomModel(sandboxInput(), translate);

  it("holds Age 1 with an honest, provisional gate checklist", () => {
    expect(state.age.current).toBe(1);
    expect(state.age.name).toBe("Survive the Winter");
    const gates = state.age.gatesToNext ?? [];
    expect(gates.find((g) => g.id === "runway3")?.passed).toBe(true);
    const flow = gates.find((g) => g.id === "positiveFlow");
    expect(flow?.passed).toBe(false);
    expect(flow?.provisional).toBe(true); // first moon not closed — no shaming
    expect(gates.find((g) => g.id === "banditsContained")?.passed).toBe(true);
  });

  it("levels the resources from real balances", () => {
    const byKey = new Map(state.resources.map((r) => [r.key, r]));
    expect(byKey.get("gold")?.level).toBe(5);
    expect(byKey.get("gold")?.displayValue).toBe("$56,580.00");
    expect(byKey.get("grain")?.level).toBe(5);
    expect(byKey.get("grain")?.displayValue).toBe("57.4 moons of grain");
    expect(byKey.get("stone")?.level).toBe(2);
    expect(byKey.get("stone")?.displayValue).toBe("$29,960.00");
    expect(byKey.get("builders")?.level).toBe(0);
    expect(byKey.get("builders")?.displayValue).toContain("1 worker departs");
    expect(byKey.get("happiness")?.level).toBe(4); // revelrous stays positive
  });

  it("caps the moat at broad while bandits hold ground", () => {
    expect(state.moat.uncapped).toBeGreaterThanOrEqual(75);
    expect(state.moat.cappedByBandits).toBe(true);
    expect(state.moat.score).toBe(74);
    expect(state.moat.tier).toBe("broad");
  });

  it("activates exactly the bandit threat; comparatives stay silently dormant", () => {
    const active = state.threats.filter((t) => t.active);
    expect(active.map((t) => t.kind)).toEqual(["bandits"]);
    expect(active[0]?.severity).toBe(2);
    expect(active[0]?.causes.map((c) => c.amount?.amountMinor)).toEqual([410_00, 5_020_00]);
    // The $500 United txn is travel — never a castle fire.
    expect(state.threats.find((t) => t.kind === "fire")?.active).toBe(false);
    expect(state.threats.find((t) => t.kind === "winter")?.dormantReason).toBe("no-data");
  });

  it("builds the expected skyline", () => {
    const keys = state.structures.map((s) => s.key);
    expect(keys).toContain("treasury");
    expect(keys).toContain("manor");
    expect(keys).toContain("guildDebt");
    expect(keys).toContain("banditCamp");
    expect(keys).not.toContain("caravans"); // no brokerage in sandbox (401k/IRA are retirement)
    expect(keys).not.toContain("watchtowers"); // no budgets seeded
    expect(state.structures.find((s) => s.key === "treasury")?.locked).toBe(true);
    expect(state.structures.find((s) => s.key === "manor")?.lien).toBe(true);
    expect(state.structures.find((s) => s.key === "banditCamp")?.hostile).toBe(true);
  });

  it("chronicles real ledger lines in kingdom voice", () => {
    const headlines = state.chronicle.map((c) => c.headline).join("\n");
    expect(headlines).toContain("The royal vault yields interest — +$4.22");
    expect(headlines).toContain("The court journeys afar — $500.00 (United Airlines)");
    expect(headlines).toContain("The crown pays the moneylenders — $25.00");
    // Every entry is traceable.
    for (const entry of state.chronicle) expect(entry.refId).not.toBe("");
  });
});

describe("age progression when the realm truly fortifies", () => {
  it("reaches Age 3 with no bandits, treasury, 6mo grain, and 10%+ savings", () => {
    const input = sandboxInput();
    input.metrics = {
      ...input.metrics,
      totalHighInterestDebt: usd(0),
      debtTrajectory: [],
      emergencyRunwayMonths: 8,
      completedMonth: month(
        "2026-07",
        { housing: 2_000_00, groceries: 600_00, dining: 400_00 },
        900_00,
      ),
      priorMonth: month(
        "2026-06",
        { housing: 2_000_00, groceries: 580_00, dining: 380_00 },
        700_00,
      ),
    };
    // Remove the credit cards from the skyline too.
    input.accounts = input.accounts.filter((a) => a.kind !== "credit");
    const state = kingdomModel(input, translate);
    expect(state.age.current).toBe(3);
    expect(state.age.name).toBe("Expand");
    expect(state.moat.cappedByBandits).toBe(false);
    expect(state.threats.find((t) => t.kind === "bandits")?.active).toBe(false);
  });
});

describe("threat activation on month-over-month data", () => {
  const base = () => {
    const input = sandboxInput();
    input.metrics = {
      ...input.metrics,
      completedMonth: month(
        "2026-07",
        { housing: 2_000_00, groceries: 600_00, dining: 300_00, entertainment: 200_00 },
        500_00,
      ),
      priorMonth: month(
        "2026-06",
        { housing: 2_000_00, groceries: 600_00, dining: 300_00, entertainment: 200_00 },
        500_00,
      ),
    };
    return input;
  };

  it("winter: essential costs up 8%+ month over month", () => {
    const input = base();
    if (input.metrics?.completedMonth) {
      input.metrics.completedMonth = month(
        "2026-07",
        { housing: 2_300_00, groceries: 700_00, dining: 300_00, entertainment: 200_00 },
        100_00,
      );
    }
    const state = kingdomModel(input, translate);
    expect(state.threats.find((t) => t.kind === "winter")?.active).toBe(true);
  });

  it("feast: lifestyle jump only when share is high — travel never counts", () => {
    const input = base();
    if (input.metrics?.completedMonth) {
      input.metrics.completedMonth = month(
        "2026-07",
        { housing: 500_00, dining: 900_00, entertainment: 700_00, travel: 2_000_00 },
        0,
      );
      input.metrics.priorMonth = month(
        "2026-06",
        { housing: 500_00, dining: 400_00, entertainment: 300_00 },
        500_00,
      );
    }
    const state = kingdomModel(input, translate);
    const feast = state.threats.find((t) => t.kind === "feast");
    expect(feast?.active).toBe(true);
    // Travel is excluded from the jump math: cause = (900+700) − (400+300).
    expect(feast?.causes[0]?.amount?.amountMinor).toBe(900_00);
  });

  it("drought: income falls 20%+", () => {
    const input = base();
    if (input.metrics?.completedMonth && input.metrics.priorMonth) {
      input.metrics.completedMonth = month("2026-07", { housing: 2_000_00 }, -500_00); // income 1500
      input.metrics.priorMonth = month("2026-06", { housing: 2_000_00 }, 3_000_00); // income 5000
    }
    const state = kingdomModel(input, translate);
    expect(state.threats.find((t) => t.kind === "drought")?.active).toBe(true);
  });

  it("fire: a single outsized non-exempt expense; granary softens the blow", () => {
    const input = base();
    input.transactions.push(
      txn({
        postedAt: "2026-08-02",
        amountMinor: -2_000_00,
        category: "health",
        merchant: "ER VET CLINIC",
      }),
    );
    const state = kingdomModel(input, translate);
    const fire = state.threats.find((t) => t.kind === "fire");
    expect(fire?.active).toBe(true);
    expect(fire?.narrative).toContain("granary absorbed");
  });
});

describe("no-fake-currency guarantees", () => {
  it("every resource and threat carries a basis string", () => {
    const state = kingdomModel(sandboxInput(), translate);
    for (const r of state.resources) expect(r.basis.length).toBeGreaterThan(0);
    for (const t of state.threats.filter((x) => x.active))
      expect(t.basis.length).toBeGreaterThan(0);
  });

  it("surveying flag when metrics are absent", () => {
    const state = kingdomModel(sandboxInput({ metrics: null }), translate);
    expect(state.surveying).toBe(true);
    expect(state.age.current).toBe(1);
  });
});
