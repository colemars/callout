// The React <-> Phaser boundary types. The renderer only ever calls BACK
// into React (never the API, never meta) — CONTRACT.md purity. Role
// assignment flows through React's existing CAS handlers.

import type { RoleId } from "../model/roads";
import type { SceneModel } from "./sceneModel";

export interface VistaCallbacks {
  /** The crown named a visitor from the in-canvas registry. */
  onAssignRole(travelerId: string, roleId: RoleId): void;
  /** The crown lets the visitor pass unnamed. */
  onClearRole(travelerId: string): void;
  /** First frame is up; the shimmer can drop. */
  onReady(): void;
}

export interface VistaHandle {
  update(model: SceneModel): void;
  /** Sleep/wake the render loop (offscreen, hidden tab). */
  setSleeping(sleeping: boolean): void;
  destroy(): void;
}
