"use client";

// The Vista's React shell: boots the Phaser world lazily (the throne room
// never blocks on it), pushes fresh SceneModels through a handle, sleeps the
// loop when the panel scrolls offscreen, and reports failure so the DOM
// StructureGrid can return as the fallback. StrictMode-safe: the boot
// effect guards with a cancelled flag and destroys on cleanup.

import { useEffect, useRef, useState } from "react";
import type { RoleId } from "../model/roads";
import type { VistaHandle } from "../scene/bridge";
import type { ReplayMoment, SceneModel } from "../scene/sceneModel";

export function KingdomVista({
  model,
  replay,
  onAssignRole,
  onClearRole,
  onBuild,
  onFail,
}: {
  model: SceneModel;
  /** "While you were away" moments — played once per reel (Stage 5). */
  replay?: ReplayMoment[] | null;
  onAssignRole: (travelerId: string, roleId: RoleId) => void;
  onClearRole: (travelerId: string) => void;
  /** Stage 6: a monument ordered from the Masons' Yard (Influence spend). */
  onBuild: (itemId: string) => void;
  onFail: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VistaHandle | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const replayRef = useRef<ReplayMoment[] | null>(null);
  const [ready, setReady] = useState(false);
  // Stage 7: the living camera — expand overlay + recenter control.
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const [cameraHome, setCameraHome] = useState(true);
  // Day/dusk is live: a theme flip reboots the canvas with the other
  // palette (rare event; textures are palette-baked, so a clean reboot is
  // the honest implementation).
  const [dark, setDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: boot exactly once — models and callbacks flow through refs
  useEffect(() => {
    let cancelled = false;
    let handle: VistaHandle | null = null;
    const parent = containerRef.current;
    if (parent === null) return;
    // A theme-flip reboot must show the shimmer again, not an empty box.
    setReady(false);

    (async () => {
      const { createVista } = await import("../scene/boot");
      const h = await createVista(
        parent,
        modelRef.current,
        {
          onAssignRole,
          onClearRole,
          onBuild,
          onCameraHome: (isHome) => {
            if (!cancelled) setCameraHome(isHome);
          },
          onReady: () => {
            if (!cancelled) setReady(true);
          },
        },
        dark,
      );
      if (cancelled) {
        h.destroy();
        return;
      }
      handle = h;
      handleRef.current = h;
      // Models that changed during the engine load window would otherwise
      // be lost — flush the latest one now.
      h.update(modelRef.current);
      h.setExpanded(expandedRef.current);
      if (replayRef.current !== null) h.playReplay(replayRef.current);
    })().catch((err) => {
      // The fallback grid takes over; the WHY must not vanish with it.
      console.error("vista boot failed", err);
      if (!cancelled) onFail();
    });

    return () => {
      cancelled = true;
      handleRef.current = null;
      handle?.destroy();
    };
    // Boot once per theme; models flow through the handle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    handleRef.current?.update(model);
  }, [model]);

  useEffect(() => {
    if (replay === undefined || replay === null || replay.length === 0) return;
    replayRef.current = replay;
    handleRef.current?.playReplay(replay);
  }, [replay]);

  // Expanded mode: the scene frees plain-wheel zoom, the page stops
  // scrolling underneath, and Escape collapses.
  useEffect(() => {
    handleRef.current?.setExpanded(expanded);
    if (!expanded) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  // Offscreen = asleep: no reason to render a kingdom nobody is watching.
  useEffect(() => {
    const parent = containerRef.current;
    if (parent === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        handleRef.current?.setSleeping(!visible);
      },
      { threshold: 0 },
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const controlClass =
    "flex h-11 min-w-11 items-center justify-center rounded-lg border border-amber-900/25 bg-amber-50/90 px-3 text-sm text-amber-900 shadow-sm backdrop-blur-sm hover:bg-amber-100 dark:border-amber-200/25 dark:bg-stone-900/85 dark:text-amber-200 dark:hover:bg-stone-800";

  return (
    <section className={expanded ? undefined : "mt-6"}>
      <div
        ref={containerRef}
        className={
          expanded
            ? // The in-page overlay: fills the viewport on every device
              // (native fullscreen is a no-go on iPhone). DOM modals (z-50)
              // still layer above.
              "fixed inset-0 z-40 overflow-hidden bg-stone-950"
            : "relative aspect-[8/5] w-full overflow-hidden rounded-xl border border-amber-900/20 dark:border-amber-200/20"
        }
      >
        {!ready && (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-amber-100/60 dark:bg-stone-900/60">
            <p className="text-sm text-stone-500 dark:text-amber-200/60">
              The painters raise their scaffolds…
            </p>
          </div>
        )}
        {ready && (
          <div className="absolute right-3 top-3 z-10 flex gap-2">
            {!cameraHome && (
              <button
                type="button"
                onClick={() => handleRef.current?.resetCamera()}
                title="Return to the full kingdom view"
                className={controlClass}
              >
                🧭 recenter
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Collapse the vista (Esc)" : "Expand the vista"}
              className={controlClass}
            >
              {expanded ? "✕ close" : "⤢ expand"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
