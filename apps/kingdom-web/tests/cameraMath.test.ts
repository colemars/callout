import { describe, expect, it } from "vitest";
import {
  type Bounds,
  MAX_ZOOM_FACTOR,
  type Viewport,
  clampState,
  fitZoom,
  homeState,
  isHome,
  panBy,
  zoomAtPoint,
} from "../src/scene/cameraMath";

// A synthetic 2:1 map in a 2:1.25 viewport — width-constrained fit.
const bounds: Bounds = { minX: -1000, minY: 0, maxX: 1000, maxY: 1000 };
const viewport: Viewport = { width: 800, height: 500 };

describe("fitZoom and home", () => {
  it("frames the whole map with the classic 0.96 margin", () => {
    expect(fitZoom(viewport, bounds)).toBeCloseTo(Math.min(800 / 2000, 500 / 1000) * 0.96);
  });

  it("home is centered, factor 1, and reads as home", () => {
    const home = homeState(bounds);
    expect(home).toEqual({ zoomFactor: 1, centerX: 0, centerY: 500 });
    expect(isHome(home)).toBe(true);
    expect(isHome({ ...home, zoomFactor: 1.2 })).toBe(false);
  });
});

describe("clampState", () => {
  it("clamps the factor to [1, MAX]", () => {
    expect(
      clampState({ zoomFactor: 0.4, centerX: 0, centerY: 500 }, viewport, bounds).zoomFactor,
    ).toBe(1);
    expect(
      clampState({ zoomFactor: 99, centerX: 0, centerY: 500 }, viewport, bounds).zoomFactor,
    ).toBe(MAX_ZOOM_FACTOR);
  });

  it("factor 1 always snaps to the exact home pose (letterboxed axes lock)", () => {
    const wild = clampState({ zoomFactor: 1, centerX: 900, centerY: -400 }, viewport, bounds);
    expect(wild).toEqual(homeState(bounds));
  });

  it("zoomed in, the visible rect never leaves the map", () => {
    const s = clampState({ zoomFactor: 2, centerX: 99999, centerY: -99999 }, viewport, bounds);
    const zoom = fitZoom(viewport, bounds) * 2;
    expect(s.centerX + 400 / zoom).toBeLessThanOrEqual(bounds.maxX + 1e-9);
    expect(s.centerY - 250 / zoom).toBeGreaterThanOrEqual(bounds.minY - 1e-9);
  });
});

describe("zoomAtPoint", () => {
  it("keeps the world point under the anchor fixed (when unclamped)", () => {
    const start = clampState({ zoomFactor: 1.5, centerX: 0, centerY: 500 }, viewport, bounds);
    const anchor = { x: 500, y: 300 }; // off-center on purpose
    const fit = fitZoom(viewport, bounds);
    const worldBefore = {
      x: start.centerX + (anchor.x - 400) / (fit * start.zoomFactor),
      y: start.centerY + (anchor.y - 250) / (fit * start.zoomFactor),
    };
    const next = zoomAtPoint(start, anchor, 2, viewport, bounds);
    const worldAfter = {
      x: next.centerX + (anchor.x - 400) / (fit * next.zoomFactor),
      y: next.centerY + (anchor.y - 250) / (fit * next.zoomFactor),
    };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it("zooming out to 1 lands exactly home", () => {
    const start = clampState({ zoomFactor: 2, centerX: 300, centerY: 700 }, viewport, bounds);
    expect(zoomAtPoint(start, { x: 100, y: 100 }, 0.5, viewport, bounds)).toEqual(
      homeState(bounds),
    );
  });
});

describe("panBy", () => {
  it("moves the center opposite the drag, scaled by zoom, and clamps", () => {
    const start = clampState({ zoomFactor: 2, centerX: 0, centerY: 500 }, viewport, bounds);
    const zoom = fitZoom(viewport, bounds) * 2;
    const panned = panBy(start, 40, -30, viewport, bounds);
    expect(panned.centerX).toBeCloseTo(start.centerX - 40 / zoom, 6);
    expect(panned.centerY).toBeCloseTo(start.centerY + 30 / zoom, 6);
    // Slam far left: clamped at the map's edge.
    const slammed = panBy(start, 1e6, 0, viewport, bounds);
    expect(slammed.centerX).toBeCloseTo(bounds.minX + 400 / zoom, 6);
  });

  it("at factor 1 panning is a no-op (home locks)", () => {
    expect(panBy(homeState(bounds), 50, 50, viewport, bounds)).toEqual(homeState(bounds));
  });
});
