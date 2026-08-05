import { describe, expect, it } from "vitest";
import type { StructureKey } from "../src/model/types";
import {
  GATE,
  RESERVED_PLOTS,
  ROADS,
  SLOTS,
  type Slot,
  isoToScreen,
  mapBounds,
  pathPoint,
} from "../src/scene/layout";

const ALL_KEYS: StructureKey[] = [
  "keep",
  "granary",
  "walls",
  "treasury",
  "caravans",
  "market",
  "festival",
  "manor",
  "guildDebt",
  "oaths",
  "banditCamp",
];

const overlaps = (a: Slot, b: Slot): boolean =>
  a.tx < b.tx + b.w && b.tx < a.tx + a.w && a.ty < b.ty + b.h && b.ty < a.ty + a.h;

describe("the authored map", () => {
  it("every StructureKey has a slot with a unique id", () => {
    const ids = new Set<string>();
    for (const key of ALL_KEYS) {
      const slot = SLOTS[key];
      expect(slot).toBeDefined();
      expect(ids.has(slot.id)).toBe(false);
      ids.add(slot.id);
    }
  });

  it("footprints are pairwise disjoint, including reserved plots", () => {
    const all = [...Object.values(SLOTS), ...RESERVED_PLOTS];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i] as Slot;
        const b = all[j] as Slot;
        expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("every road starts at the map edge and ends at the gate", () => {
    for (const [name, road] of Object.entries(ROADS)) {
      const first = road[0];
      const last = road[road.length - 1];
      const onEdge =
        first !== undefined && (first.tx <= 0 || first.ty <= 0 || first.tx >= 16 || first.ty >= 11);
      expect(onEdge, `${name} must start on an edge`).toBe(true);
      expect(last).toEqual({ tx: GATE.tx, ty: GATE.ty });
    }
  });

  it("pathPoint is anchored and monotone in arc length", () => {
    for (const roadId of ["north", "west", "east"] as const) {
      const start = pathPoint(roadId, 0);
      const gate = pathPoint(roadId, 1);
      const firstTile = ROADS[roadId][0];
      expect(firstTile).toBeDefined();
      if (firstTile !== undefined) {
        expect(start).toEqual(isoToScreen(firstTile.tx, firstTile.ty));
      }
      expect(gate).toEqual(isoToScreen(GATE.tx, GATE.ty));
      // Monotone: distance to the gate never increases as t grows.
      let previous = Number.POSITIVE_INFINITY;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const p = pathPoint(roadId, t);
        const d = Math.hypot(p.x - gate.x, p.y - gate.y);
        expect(d).toBeLessThanOrEqual(previous + 0.0001);
        previous = d;
      }
      // Clamping
      expect(pathPoint(roadId, -1)).toEqual(start);
      expect(pathPoint(roadId, 2)).toEqual(gate);
    }
  });

  it("map bounds contain every slot corner", () => {
    const b = mapBounds();
    for (const slot of [...Object.values(SLOTS), ...RESERVED_PLOTS]) {
      for (const [cx, cy] of [
        [slot.tx, slot.ty],
        [slot.tx + slot.w, slot.ty + slot.h],
      ] as const) {
        const p = isoToScreen(cx, cy);
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.y).toBeGreaterThanOrEqual(b.minY);
        expect(p.y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });
});
