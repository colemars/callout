"use client";

// The Vista's React shell: boots the Phaser world lazily (the throne room
// never blocks on it), pushes fresh SceneModels through a handle, sleeps the
// loop when the panel scrolls offscreen, and reports failure so the DOM
// StructureGrid can return as the fallback. StrictMode-safe: the boot
// effect guards with a cancelled flag and destroys on cleanup.

import { useEffect, useRef, useState } from "react";
import type { RoleId } from "../model/roads";
import type { VistaHandle } from "../scene/bridge";
import type { SceneModel } from "../scene/sceneModel";

export function KingdomVista({
  model,
  onAssignRole,
  onClearRole,
  onFail,
}: {
  model: SceneModel;
  onAssignRole: (travelerId: string, roleId: RoleId) => void;
  onClearRole: (travelerId: string) => void;
  onFail: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VistaHandle | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [ready, setReady] = useState(false);
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

  return (
    <section className="mt-6">
      <div
        ref={containerRef}
        className="relative aspect-[8/5] w-full overflow-hidden rounded-xl border border-amber-900/20 dark:border-amber-200/20"
      >
        {!ready && (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-amber-100/60 dark:bg-stone-900/60">
            <p className="text-sm text-stone-500 dark:text-amber-200/60">
              The painters raise their scaffolds…
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
