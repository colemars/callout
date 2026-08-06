// The React <-> Phaser boundary types. The renderer only ever calls BACK
// into React (never the API, never meta) — CONTRACT.md purity. Role
// assignment flows through React's existing CAS handlers.

import type { RoleId } from "../model/roads";
import type { ReplayMoment, SceneModel } from "./sceneModel";

export interface VistaCallbacks {
  /** The crown named a visitor from the in-canvas registry. */
  onAssignRole(travelerId: string, roleId: RoleId): void;
  /** The crown lets the visitor pass unnamed. */
  onClearRole(travelerId: string): void;
  /** Stage 6: the crown orders a monument raised (an Influence purchase). */
  onBuild(itemId: string): void;
  /** Stage 7: camera left/returned to the home framing (recenter button). */
  onCameraHome(isHome: boolean): void;
  /** First frame is up; the shimmer can drop. */
  onReady(): void;
}

export interface VistaHandle {
  update(model: SceneModel): void;
  /** Play the "while you were away" reel (Stage 5). */
  playReplay(moments: ReplayMoment[]): void;
  /** Sleep/wake the render loop (offscreen, hidden tab). */
  setSleeping(sleeping: boolean): void;
  /** Stage 7: animate the camera back to the full-map home pose. */
  resetCamera(): void;
  /** Stage 7: expanded mode frees plain-wheel zoom (inline needs Ctrl/⌘). */
  setExpanded(expanded: boolean): void;
  destroy(): void;
}
