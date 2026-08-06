// The code-split boundary: Phaser and the scene modules load ONLY through
// the dynamic imports below, so the throne room's initial bundle never
// carries the engine. Failure here is survivable — the caller falls back to
// the DOM StructureGrid.

import type { VistaCallbacks, VistaHandle } from "./bridge";
import { DAY, DUSK } from "./palette";
import type { SceneModel } from "./sceneModel";

export async function createVista(
  parent: HTMLElement,
  model: SceneModel,
  callbacks: VistaCallbacks,
  dark: boolean,
): Promise<VistaHandle> {
  const [{ default: Phaser }, { VistaScene }] = await Promise.all([
    import("phaser"),
    import("./VistaScene"),
  ]);

  // The React shell owns the theme listener and reboots on change —
  // day/dusk is live, not a boot-time snapshot.
  const palette = dark ? DUSK : DAY;

  const scene = new VistaScene();
  const initial = parent.getBoundingClientRect();
  const game = new Phaser.Game({
    type: Phaser.AUTO, // CANVAS fallback for WebGL-less devices comes free
    parent,
    backgroundColor: palette.sky,
    scale: {
      // RESIZE mode, but WE drive it: Phaser's own parent polling only
      // re-measures on window resize, so a zero-size read during React
      // mount churn would stick forever. The ResizeObserver below is the
      // single source of truth for canvas size.
      mode: Phaser.Scale.RESIZE,
      width: Math.max(64, Math.round(initial.width)),
      height: Math.max(40, Math.round(initial.height)),
    },
    input: {
      // Stage 7: pinch needs two live touch pointers (+1 for a stray palm).
      activePointers: 3,
      // Wheel stays PASSIVE in Phaser: the scene's own canvas listener makes
      // the per-event call (zoom+preventDefault vs. let the page scroll).
      mouse: { preventDefaultWheel: false },
    },
    // Note: canvas backing is CSS-pixel sized (Phaser 3 dropped the global
    // resolution option); panel TEXT crispness comes from per-Text
    // setResolution(min(DPR,2)) in panels.ts — the part that matters.
    scene: [],
  });

  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect === undefined || rect.width < 50 || rect.height < 40) return;
    game.scale.resize(Math.round(rect.width), Math.round(rect.height));
  });
  observer.observe(parent);

  game.scene.add("vista", scene, true, { palette, callbacks, model });
  // Debug handle for the test bench and console poking; carries no data.
  (window as { __vista?: unknown }).__vista = { game, scene };

  const onVisibility = () => {
    if (document.hidden) game.loop.sleep();
    else game.loop.wake();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    update(next: SceneModel) {
      scene.updateModel(next);
    },
    playReplay(moments) {
      scene.playReplay(moments);
    },
    setSleeping(sleeping: boolean) {
      if (sleeping) game.loop.sleep();
      else game.loop.wake();
    },
    resetCamera() {
      scene.resetCamera(true);
    },
    setExpanded(expanded: boolean) {
      scene.setExpanded(expanded);
    },
    destroy() {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      game.destroy(true);
    },
  };
}
