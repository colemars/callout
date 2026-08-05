// The pure bridge between the kingdom model and the renderer (CONTRACT.md:
// the engine is a pure consumer). buildSceneModel maps KingdomState +
// RoadsState into placed sprites with stable keys — no Phaser imports, no
// clock, fully unit-testable. The Phaser layer is a thin shell over this.

import type { KingdomDelta } from "../model/diff";
import { SPEND_CATALOG } from "../model/economy";
import type { RoadsState, RoleId, TravelerState } from "../model/roads";
import type { KingdomState, StructureKey, StructureState, ThreatKind } from "../model/types";
import { RESERVED_PLOTS, type RoadId, SLOTS } from "./layout";

export type TravelerArchetype = "merchant" | "courier" | "official" | "guard" | "raider" | "guest";

export interface PlacedStructure {
  key: StructureKey;
  slotId: string;
  /** Art tier collapses level 0-5 -> 1-3 (asset variants per structure). */
  artTier: 1 | 2 | 3;
  /** Full structure state — the steward's panel renders from this. */
  state: StructureState;
}

export interface PlacedTraveler {
  id: string;
  roadId: RoadId;
  /** 0 = map edge, 1 = the gate. */
  t: number;
  /** Deterministic fan-out index for travelers clustered at the gate. */
  gateSlot: number | null;
  archetype: TravelerArchetype;
  tone: TravelerState["tone"];
  /** status "quiet": expected but unseen — a ghost at the gate. */
  ghosted: boolean;
  /** status "overdue": clustered at the gate, agitated. */
  agitated: boolean;
  name: string;
  /** Passthrough for hover labels. */
  arrivalCopy: string;
  /** Full traveler state — the in-canvas Road Registry renders from this. */
  state: TravelerState;
}

/** Stage 6: a reserved plot and its designated monument's build state. */
export interface PlotModel {
  id: string;
  /** The one monument the masons will raise HERE (fixed siting). */
  monument: { itemId: string; name: string; flavor: string; price: number } | null;
  built: boolean;
  /** ISO timestamp of the raising spend — null until built (or unknown). */
  builtAt: string | null;
  /** Whether the crown's current Influence covers the asking price. */
  affordable: boolean;
}

/** The slice of the economy the vista needs — pure data, no meta machinery. */
export interface EconomyLite {
  balance: number;
  unlocks: readonly string[];
  spends: ReadonlyArray<{ itemId: string; at: string }>;
}

export interface SceneModel {
  surveying: boolean;
  ageId: 1 | 2 | 3 | 4;
  structures: PlacedStructure[];
  /** Reserved build plots with their build state — always present. */
  plots: PlotModel[];
  /** The crown's Influence balance — null when the economy is unavailable. */
  influence: number | null;
  travelers: PlacedTraveler[];
  /** ACTIVE threats only — dormant threats render NOTHING (contract). */
  weather: Partial<Record<ThreatKind, 1 | 2 | 3>>;
  /** Ambient villager count from the builders resource (rendered Stage 2). */
  ambientCount: number;
  /** True when meta writes are unavailable — the registry shows, never edits. */
  registryReadOnly: boolean;
}

/** How far out (days) the map edge sits. 30+ days = the horizon. */
export const ETA_HORIZON_DAYS = 30;
/** Travelers at t >= this cluster at the gate and fan out. */
export const GATE_CLUSTER_T = 0.97;

const ARCHETYPES: Record<RoleId, TravelerArchetype> = {
  visitor: "merchant",
  players: "merchant",
  provisioner: "merchant",
  courier: "courier",
  taxcollector: "official",
  collectors: "official",
  lamplighters: "official",
  quartermaster: "official",
  guard: "guard",
  loansharks: "raider",
  parasite: "raider",
  healer: "guest",
  honored: "guest",
};

function archetypeFor(traveler: TravelerState): TravelerArchetype {
  const known = ARCHETYPES[traveler.role];
  if (known !== undefined) return known;
  // Unknown role id (newer catalog): fall back by tone.
  return traveler.tone === "hostile"
    ? "raider"
    : traveler.tone === "friendly"
      ? "guest"
      : "merchant";
}

const ROAD_BY_SOURCE: Record<TravelerState["source"], RoadId> = {
  recurring: "north",
  due: "west",
  income: "east",
};

/** ETA -> path parameter. Derives ONLY from status and etaDays. */
export function travelerT(traveler: TravelerState): {
  t: number;
  ghosted: boolean;
  agitated: boolean;
} {
  switch (traveler.status) {
    case "at-gates":
      return { t: 1, ghosted: false, agitated: false };
    case "overdue":
      return { t: 1, ghosted: false, agitated: true };
    case "quiet":
      return { t: 1, ghosted: true, agitated: false };
    case "approaching": {
      const days = Math.min(Math.max(traveler.etaDays, 0), ETA_HORIZON_DAYS);
      return { t: 1 - days / ETA_HORIZON_DAYS, ghosted: false, agitated: false };
    }
  }
}

const STATUS_RANK: Record<TravelerState["status"], number> = {
  overdue: 0,
  "at-gates": 1,
  quiet: 2,
  approaching: 3,
};

const ART_TIER: Record<0 | 1 | 2 | 3 | 4 | 5, 1 | 2 | 3> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
};

const AMBIENT_BY_BUILDERS: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
};

/** Plots with their designated monuments' build state (Stage 6). */
function buildPlots(economy: EconomyLite | null): PlotModel[] {
  return RESERVED_PLOTS.map((plot) => {
    const item = SPEND_CATALOG.find((i) => i.monument?.plotId === plot.id);
    if (item === undefined)
      return { id: plot.id, monument: null, built: false, builtAt: null, affordable: false };
    const built = economy?.unlocks.includes(item.id) ?? false;
    return {
      id: plot.id,
      monument: { itemId: item.id, name: item.name, flavor: item.flavor, price: item.price },
      built,
      builtAt: built ? (economy?.spends.find((s) => s.itemId === item.id)?.at ?? null) : null,
      affordable: economy !== null && economy.balance >= item.price,
    };
  });
}

export function buildSceneModel(
  kingdom: KingdomState,
  roads: RoadsState | null,
  registryReadOnly = false,
  economy: EconomyLite | null = null,
): SceneModel {
  const plots = buildPlots(economy);
  const influence = economy?.balance ?? null;

  if (kingdom.surveying) {
    // The surveyors have not mapped the realm — terrain and plots only,
    // never a guessed kingdom (silence over false comfort).
    return {
      surveying: true,
      ageId: kingdom.age.current,
      structures: [],
      plots,
      influence,
      travelers: [],
      weather: {},
      ambientCount: 0,
      registryReadOnly,
    };
  }

  const structures: PlacedStructure[] = kingdom.structures
    .filter((s) => s.exists)
    .map((s) => ({
      key: s.key,
      slotId: SLOTS[s.key].id,
      artTier: ART_TIER[s.level],
      state: s,
    }));

  // One sprite per traveler.id — a merchant can legitimately appear twice
  // (a bank due date AND an observed charge habit are two real facts).
  const placed = (roads?.travelers ?? []).map((traveler) => {
    const { t, ghosted, agitated } = travelerT(traveler);
    return {
      id: traveler.id,
      roadId: ROAD_BY_SOURCE[traveler.source],
      t,
      gateSlot: null as number | null,
      archetype: archetypeFor(traveler),
      tone: traveler.tone,
      ghosted,
      agitated,
      name: traveler.name,
      arrivalCopy: traveler.arrivalCopy,
      state: traveler,
      status: traveler.status,
    };
  });

  // Deterministic gate fan-out: clustered travelers get unique slots per
  // road (sorted by status urgency, then id) so sprites never fully overlap.
  for (const roadId of ["north", "west", "east"] as const) {
    const clustered = placed
      .filter((p) => p.roadId === roadId && p.t >= GATE_CLUSTER_T)
      .sort((a, b) => {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        return rank !== 0 ? rank : a.id.localeCompare(b.id);
      });
    clustered.forEach((p, i) => {
      p.gateSlot = i;
    });
  }

  const weather: SceneModel["weather"] = {};
  for (const threat of kingdom.threats) {
    if (!threat.active || threat.severity === 0) continue;
    weather[threat.kind] = threat.severity;
  }

  const builders = kingdom.resources.find((r) => r.key === "builders");

  return {
    surveying: false,
    ageId: kingdom.age.current,
    structures,
    plots,
    influence,
    travelers: placed.map(({ status: _status, ...rest }) => rest),
    weather,
    ambientCount: AMBIENT_BY_BUILDERS[builders?.level ?? 0],
    registryReadOnly,
  };
}

// ---------------------------------------------------------------------------
// Stage 5: replay cinematics. "While you were away" deltas become MOMENTS the
// vista plays back — pure mapping over the policy-free KingdomDelta feed
// (CONTRACT.md). The DOM text strip remains the ledger; this is spectacle.
// ---------------------------------------------------------------------------

export interface ReplayMoment {
  /** Where it happens: a structure's slot, or "sky" for realm-wide news. */
  at: StructureKey | "sky";
  caption: string;
  tone: "good" | "bad" | "info";
}

/** The vista plays at most this many moments per replay. */
export const REPLAY_MOMENT_CAP = 8;

const THREAT_HOME: Partial<Record<ThreatKind, StructureKey>> = {
  bandits: "banditCamp",
  feast: "festival",
  winter: "granary",
};

export function replayMoments(deltas: readonly KingdomDelta[]): ReplayMoment[] {
  const moments: ReplayMoment[] = [];
  for (const delta of deltas) {
    switch (delta.type) {
      case "AGE_ADVANCED":
        moments.push({ at: "sky", caption: `A new age dawns: ${delta.toName}`, tone: "good" });
        break;
      case "AGE_REGRESSED":
        moments.push({ at: "sky", caption: `The age slips back to ${delta.toName}`, tone: "bad" });
        break;
      case "THREAT_ENDED":
        moments.push({
          at: THREAT_HOME[delta.kind] ?? "sky",
          caption: `${delta.title} has passed`,
          tone: "good",
        });
        break;
      case "THREAT_STARTED":
        moments.push({
          at: THREAT_HOME[delta.kind] ?? "sky",
          caption: delta.title,
          tone: "bad",
        });
        break;
      case "STRUCTURE_APPEARED":
        moments.push({ at: delta.key, caption: `${delta.name} rises`, tone: "good" });
        break;
      case "STRUCTURE_REMOVED":
        moments.push({ at: delta.key, caption: `${delta.name} stands no more`, tone: "info" });
        break;
      case "STRUCTURE_LEVEL_CHANGED":
        moments.push({
          at: delta.key,
          caption: delta.to > delta.from ? `${delta.name} grows` : `${delta.name} wanes`,
          tone: delta.to > delta.from ? "good" : "bad",
        });
        break;
      case "MOAT_CHANGED":
        if (delta.fromTier !== delta.toTier) {
          moments.push({
            at: "sky",
            caption:
              delta.to > delta.from
                ? `The moat deepens — it runs ${delta.toTier}`
                : `The moat thins — it runs ${delta.toTier}`,
            tone: delta.to > delta.from ? "good" : "bad",
          });
        }
        break;
      // Resource ticks and chronicle entries stay in the text strip — the
      // reel is for moments, not bookkeeping.
      default:
        break;
    }
  }
  return moments.slice(0, REPLAY_MOMENT_CAP);
}
