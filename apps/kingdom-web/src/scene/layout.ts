// The authored kingdom map (Phaser Stage 1, "The Vista"): a hand-designed
// isometric layout — every StructureKey has a fixed home, roads enter from
// the map edges and meet at the gate, and empty plots stand reserved for the
// future Influence-build endgame. Fixed slots make the kingdom a PLACE the
// player remembers, and make sprite lifecycles trivially stable.
//
// Pure module: tile math only, no Phaser imports. Distances are in world
// pixels after iso projection; the scene's world camera fits MAP_BOUNDS.

import type { StructureKey } from "../model/types";

export const TILE = { w: 128, h: 64 } as const;

/** Standard 2:1 isometric projection, tile units -> world pixels. */
export function isoToScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE.w / 2), y: (tx + ty) * (TILE.h / 2) };
}

export interface Slot {
  id: string;
  /** Tile coordinates of the footprint's north corner. */
  tx: number;
  ty: number;
  /** Footprint in tiles. */
  w: number;
  h: number;
}

/** Where each structure lives — fixed forever (stable, memorable, diffable). */
export const SLOTS: Record<StructureKey, Slot> = {
  keep: { id: "slot-keep", tx: 7, ty: 2, w: 2, h: 2 },
  treasury: { id: "slot-treasury", tx: 10, ty: 2, w: 2, h: 2 },
  oaths: { id: "slot-oaths", tx: 4, ty: 2, w: 2, h: 2 },
  granary: { id: "slot-granary", tx: 2, ty: 5, w: 2, h: 2 },
  market: { id: "slot-market", tx: 5, ty: 5, w: 2, h: 2 },
  festival: { id: "slot-festival", tx: 10, ty: 5, w: 2, h: 2 },
  caravans: { id: "slot-caravans", tx: 13, ty: 4, w: 2, h: 2 },
  manor: { id: "slot-manor", tx: 1, ty: 8, w: 2, h: 2 },
  guildDebt: { id: "slot-guild", tx: 13, ty: 7, w: 2, h: 2 },
  walls: { id: "slot-walls", tx: 7, ty: 7, w: 2, h: 1 },
  // Beyond the walls, in the wild corner — hostile ground.
  banditCamp: { id: "slot-bandits", tx: 13, ty: 10, w: 2, h: 2 },
};

/** Empty ground held for the Influence-build endgame (Stage 6). */
export const RESERVED_PLOTS: Slot[] = [
  { id: "plot-a", tx: 2, ty: 2, w: 2, h: 2 },
  { id: "plot-b", tx: 8, ty: 5, w: 2, h: 2 },
  { id: "plot-c", tx: 4, ty: 8, w: 2, h: 2 },
];

/** The gate: where every road ends and travelers arrive. */
export const GATE = { tx: 8, ty: 8.5 } as const;

export type RoadId = "north" | "west" | "east";

/** Road polylines in tile space, map edge -> gate. */
export const ROADS: Record<RoadId, ReadonlyArray<{ tx: number; ty: number }>> = {
  // Recurring merchants ride down from the northern passes.
  north: [
    { tx: 12, ty: 0 },
    { tx: 10, ty: 4 },
    { tx: GATE.tx, ty: GATE.ty },
  ],
  // The banks' collectors come up the western lowland road.
  west: [
    { tx: 0, ty: 11 },
    { tx: 4, ty: 10 },
    { tx: GATE.tx, ty: GATE.ty },
  ],
  // Wages and yields arrive on the eastern trade road.
  east: [
    { tx: 16, ty: 8 },
    { tx: 12, ty: 9 },
    { tx: GATE.tx, ty: GATE.ty },
  ],
};

/** World-pixel bounds of the whole map (for the camera fit). */
export function mapBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const corners = [isoToScreen(0, 0), isoToScreen(17, 0), isoToScreen(0, 12), isoToScreen(17, 12)];
  return {
    minX: Math.min(...corners.map((c) => c.x)) - TILE.w / 2,
    minY: Math.min(...corners.map((c) => c.y)) - TILE.h,
    maxX: Math.max(...corners.map((c) => c.x)) + TILE.w / 2,
    maxY: Math.max(...corners.map((c) => c.y)) + TILE.h,
  };
}

/**
 * A point along a road, arc-length parameterized: t=0 is the map edge,
 * t=1 the gate. Monotone in t; pure and clock-free.
 */
export function pathPoint(roadId: RoadId, t: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const points = ROADS[roadId].map((p) => isoToScreen(p.tx, p.ty));
  // Exact anchors — the arc walk accumulates float error at the ends.
  if (clamped === 0) return points[0] as { x: number; y: number };
  if (clamped === 1) return points[points.length - 1] as { x: number; y: number };
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(len);
    total += len;
  }
  let remaining = clamped * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    const len = lengths[i - 1] as number;
    if (remaining <= len || i === points.length - 1) {
      const f = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    remaining -= len;
  }
  return points[points.length - 1] as { x: number; y: number };
}
