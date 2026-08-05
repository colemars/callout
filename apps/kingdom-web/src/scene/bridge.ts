// The React <-> Phaser boundary types. The renderer only ever calls BACK
// into React (never the API, never meta) — CONTRACT.md purity.

import type { SceneModel } from "./sceneModel";

export interface VistaCallbacks {
  /** A traveler sprite was tapped — React opens the DOM Road Registry. */
  onTravelerTap(travelerId: string): void;
  /** First frame is up; the shimmer can drop. */
  onReady(): void;
}

export interface VistaHandle {
  update(model: SceneModel): void;
  /** Sleep/wake the render loop (offscreen, hidden tab). */
  setSleeping(sleeping: boolean): void;
  destroy(): void;
}
