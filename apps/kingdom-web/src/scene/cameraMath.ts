// Stage 7, the living camera — pure math only (no Phaser, no clock). The
// world camera's pose is a CameraState: a zoom FACTOR relative to the fit
// zoom (1 = the whole map framed, the home pose) plus a world-space center.
// Everything here clamps: the kingdom can never be lost off-screen.

export interface CameraState {
  /** Relative to fitZoom: 1 = full map. Clamped to [1, MAX_ZOOM_FACTOR]. */
  zoomFactor: number;
  centerX: number;
  centerY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM_FACTOR = 1;
export const MAX_ZOOM_FACTOR = 2.5;

/** The zoom that frames the whole map (the pre-Stage-7 fixed behavior). */
export function fitZoom(viewport: Viewport, bounds: Bounds): number {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  return Math.min(viewport.width / bw, viewport.height / bh) * 0.96;
}

/** The home pose: full map, centered. */
export function homeState(bounds: Bounds): CameraState {
  return {
    zoomFactor: 1,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
  };
}

export function isHome(state: CameraState): boolean {
  return state.zoomFactor <= MIN_ZOOM_FACTOR + 0.001;
}

const clampFactor = (factor: number): number =>
  Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor));

/**
 * Clamp a pose: factor into range, and the visible rect kept inside the map
 * bounds. On any axis where the viewport sees MORE world than the map spans
 * (letterbox), the center locks to the map's center — so factor 1 is always
 * exactly the home framing.
 */
export function clampState(state: CameraState, viewport: Viewport, bounds: Bounds): CameraState {
  const zoomFactor = clampFactor(state.zoomFactor);
  const zoom = fitZoom(viewport, bounds) * zoomFactor;
  const halfW = viewport.width / zoom / 2;
  const halfH = viewport.height / zoom / 2;
  const clampAxis = (value: number, min: number, max: number, half: number): number => {
    const lo = min + half;
    const hi = max - half;
    return lo > hi ? (min + max) / 2 : Math.min(hi, Math.max(lo, value));
  };
  return {
    zoomFactor,
    centerX: clampAxis(state.centerX, bounds.minX, bounds.maxX, halfW),
    centerY: clampAxis(state.centerY, bounds.minY, bounds.maxY, halfH),
  };
}

/**
 * Zoom anchored at a screen point: the world point under the cursor (or
 * pinch midpoint) stays under it — the map grows around your finger, it
 * does not slide away. Clamping may still shift it at the map's edges.
 */
export function zoomAtPoint(
  state: CameraState,
  screen: { x: number; y: number },
  newFactor: number,
  viewport: Viewport,
  bounds: Bounds,
): CameraState {
  const fit = fitZoom(viewport, bounds);
  const oldZoom = fit * clampFactor(state.zoomFactor);
  const factor = clampFactor(newFactor);
  const newZoom = fit * factor;
  const offX = screen.x - viewport.width / 2;
  const offY = screen.y - viewport.height / 2;
  const worldX = state.centerX + offX / oldZoom;
  const worldY = state.centerY + offY / oldZoom;
  return clampState(
    { zoomFactor: factor, centerX: worldX - offX / newZoom, centerY: worldY - offY / newZoom },
    viewport,
    bounds,
  );
}

/** Drag pan: pointer moved (dx, dy) CSS px, so the world slides with it. */
export function panBy(
  state: CameraState,
  dx: number,
  dy: number,
  viewport: Viewport,
  bounds: Bounds,
): CameraState {
  const zoom = fitZoom(viewport, bounds) * clampFactor(state.zoomFactor);
  return clampState(
    { ...state, centerX: state.centerX - dx / zoom, centerY: state.centerY - dy / zoom },
    viewport,
    bounds,
  );
}
