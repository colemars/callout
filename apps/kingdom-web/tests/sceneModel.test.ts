import { describe, expect, it } from "vitest";
import type { RoadsState, TravelerState } from "../src/model/roads";
import type { KingdomState, StructureState } from "../src/model/types";
import { GATE, RESERVED_PLOTS, SLOTS } from "../src/scene/layout";
import {
  ETA_HORIZON_DAYS,
  REPLAY_MOMENT_CAP,
  buildSceneModel,
  replayMoments,
  travelerT,
} from "../src/scene/sceneModel";

const structure = (key: StructureState["key"], level: StructureState["level"]): StructureState => ({
  key,
  name: key,
  icon: "x",
  exists: true,
  level,
  value: null,
  unit: "count",
  detail: "",
});

const kingdom = (overrides?: Partial<KingdomState>): KingdomState =>
  ({
    schemaVersion: 1,
    asOf: "2026-08-05",
    age: { current: 2, name: "x", icon: "x", tagline: "", gatesToNext: null, provisional: false },
    resources: [
      {
        key: "builders",
        themeName: "b",
        icon: "x",
        level: 3,
        value: null,
        max: null,
        unit: "count",
        displayValue: "",
        basis: "",
        provisional: false,
      },
    ],
    structures: [structure("keep", 1), structure("banditCamp", 4)],
    threats: [],
    moat: {
      score: 50,
      uncapped: 50,
      cappedByBandits: false,
      tier: "narrow",
      tierLabel: "",
      components: [],
    },
    chronicle: [],
    surveying: false,
    ...overrides,
  }) as KingdomState;

const traveler = (overrides: Partial<TravelerState>): TravelerState => ({
  id: "merchant:NETFLIX",
  source: "recurring",
  name: "NETFLIX",
  role: "players",
  roleAssigned: false,
  icon: "🎭",
  tone: "neutral",
  etaDays: 15,
  arrivesOn: "2026-08-20",
  status: "approaching",
  cadence: "",
  arrivalCopy: "",
  basis: "",
  ...overrides,
});

const roads = (travelers: TravelerState[]): RoadsState => ({ travelers });

describe("buildSceneModel", () => {
  it("is deterministic", () => {
    const k = kingdom();
    const r = roads([traveler({})]);
    expect(buildSceneModel(k, r)).toEqual(buildSceneModel(k, r));
  });

  it("surveying renders terrain only — plots present, nothing guessed", () => {
    const m = buildSceneModel(kingdom({ surveying: true }), roads([traveler({})]));
    expect(m.structures).toEqual([]);
    expect(m.travelers).toEqual([]);
    expect(m.reservedPlots.length).toBeGreaterThan(0);
  });

  it("every existing structure gets its authored slot; tiers collapse 0-5 -> 1-3", () => {
    const m = buildSceneModel(kingdom(), null);
    const keep = m.structures.find((s) => s.key === "keep");
    const camp = m.structures.find((s) => s.key === "banditCamp");
    expect(keep?.slotId).toBe(SLOTS.keep.id);
    expect(keep?.artTier).toBe(1); // level 1
    expect(camp?.artTier).toBe(3); // level 4
    // exists:false structures are absent
    const gone = kingdom({
      structures: [{ ...structure("manor", 2), exists: false }],
    });
    expect(buildSceneModel(gone, null).structures).toEqual([]);
  });

  it("one sprite per traveler.id — same merchant as due + recurring is two", () => {
    const m = buildSceneModel(
      kingdom(),
      roads([
        traveler({ id: "merchant:CHASE EPAY", name: "CHASE EPAY" }),
        traveler({ id: "due:acct-1", source: "due", name: "Chase collector" }),
      ]),
    );
    expect(m.travelers).toHaveLength(2);
    expect(m.travelers.map((t) => t.roadId).sort()).toEqual(["north", "west"]);
  });

  it("weather carries ACTIVE threats only — dormant renders nothing", () => {
    const m = buildSceneModel(
      kingdom({
        threats: [
          {
            kind: "winter",
            active: true,
            severity: 2,
            title: "",
            narrative: "",
            causes: [],
            basis: "",
          },
          {
            kind: "drought",
            active: false,
            dormantReason: "no-data",
            severity: 0,
            title: "",
            narrative: "",
            causes: [],
            basis: "",
          },
        ],
      } as unknown as Partial<KingdomState>),
      null,
    );
    expect(m.weather).toEqual({ winter: 2 });
  });

  it("ambient count follows the builders level table", () => {
    expect(buildSceneModel(kingdom(), null).ambientCount).toBe(12); // level 3
    const none = kingdom({ resources: [] });
    expect(buildSceneModel(none, null).ambientCount).toBe(0);
  });

  it("archetypes collapse roles; unknown roles fall back by tone", () => {
    const m = buildSceneModel(
      kingdom(),
      roads([
        traveler({ id: "a", role: "loansharks", tone: "hostile" }),
        traveler({ id: "b", role: "courier" }),
        traveler({ id: "c", role: "dragonrider" as never, tone: "friendly" }),
      ]),
    );
    const by = new Map(m.travelers.map((t) => [t.id, t.archetype]));
    expect(by.get("a")).toBe("raider");
    expect(by.get("b")).toBe("courier");
    expect(by.get("c")).toBe("guest");
  });

  it("travelers carry their full state; registryReadOnly flows through", () => {
    const t = traveler({});
    const open = buildSceneModel(kingdom(), roads([t]), false);
    expect(open.travelers[0]?.state).toEqual(t);
    expect(open.registryReadOnly).toBe(false);
    const sealed = buildSceneModel(kingdom({ surveying: true }), null, true);
    expect(sealed.registryReadOnly).toBe(true);
  });

  it("gate fan-out is deterministic and unique per road", () => {
    const m = buildSceneModel(
      kingdom(),
      roads([
        traveler({ id: "z", status: "at-gates", etaDays: 0 }),
        traveler({ id: "a", status: "overdue", etaDays: -2 }),
        traveler({ id: "m", status: "quiet", etaDays: -3 }),
        traveler({ id: "far", etaDays: 20 }), // not clustered
      ]),
    );
    const slots = new Map(m.travelers.map((t) => [t.id, t.gateSlot]));
    expect(slots.get("a")).toBe(0); // overdue ranks first
    expect(slots.get("z")).toBe(1);
    expect(slots.get("m")).toBe(2);
    expect(slots.get("far")).toBeNull();
  });
});

describe("travelerT — the ETA math", () => {
  const at = (etaDays: number, status: TravelerState["status"]) =>
    travelerT(traveler({ etaDays, status }));

  it("maps the horizon honestly", () => {
    expect(at(45, "approaching").t).toBe(0); // beyond the horizon = map edge
    expect(at(ETA_HORIZON_DAYS, "approaching").t).toBe(0);
    expect(at(15, "approaching").t).toBe(0.5);
    expect(at(1, "approaching").t).toBeCloseTo(29 / 30);
    expect(at(0, "approaching").t).toBe(1);
  });

  it("statuses pin the gate", () => {
    expect(at(0, "at-gates")).toEqual({ t: 1, ghosted: false, agitated: false });
    expect(at(-3, "overdue")).toEqual({ t: 1, ghosted: false, agitated: true });
    expect(at(-4, "quiet")).toEqual({ t: 1, ghosted: true, agitated: false });
  });
});

describe("layout sanity used by the model", () => {
  it("reserved plots are non-empty and distinct from structure slots", () => {
    const slotIds = new Set(Object.values(SLOTS).map((s) => s.id));
    expect(RESERVED_PLOTS.length).toBeGreaterThan(0);
    for (const plot of RESERVED_PLOTS) expect(slotIds.has(plot.id)).toBe(false);
    expect(GATE.tx).toBeGreaterThan(0);
  });
});

describe("replayMoments — the reel (Stage 5)", () => {
  it("maps the notable deltas, skips bookkeeping, and caps the reel", () => {
    const moments = replayMoments([
      { type: "AGE_ADVANCED", from: 1, to: 2, toName: "Age of Timber" },
      { type: "THREAT_ENDED", kind: "bandits", title: "The raiders withdraw" },
      { type: "RESOURCE_VALUE_CHANGED", key: "gold", fromValue: 1, toValue: 2, pctChange: 1 },
      { type: "STRUCTURE_LEVEL_CHANGED", key: "granary", name: "The Granary", from: 2, to: 3 },
      { type: "STRUCTURE_LEVEL_CHANGED", key: "manor", name: "The Manor", from: 3, to: 2 },
      { type: "MOAT_CHANGED", from: 40, to: 55, fromTier: "narrow", toTier: "broad" },
      {
        type: "CHRONICLE_NEW",
        entry: { date: "d", icon: "x", headline: "h", tone: "info", source: "event", refId: "r" },
      },
    ] as never);
    expect(moments).toEqual([
      { at: "sky", caption: "A new age dawns: Age of Timber", tone: "good" },
      { at: "banditCamp", caption: "The raiders withdraw has passed", tone: "good" },
      { at: "granary", caption: "The Granary grows", tone: "good" },
      { at: "manor", caption: "The Manor wanes", tone: "bad" },
      { at: "sky", caption: "The moat deepens — it runs broad", tone: "good" },
    ]);
  });

  it("caps at the reel limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: "STRUCTURE_APPEARED",
      key: "market",
      name: `S${i}`,
      level: 1,
    }));
    expect(replayMoments(many as never)).toHaveLength(REPLAY_MOMENT_CAP);
  });
});
