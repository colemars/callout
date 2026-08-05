"use client";

// The Vista's React shell: boots the Phaser world lazily (the throne room
// never blocks on it), pushes fresh SceneModels through a handle, sleeps the
// loop when the panel scrolls offscreen, and reports failure so the DOM
// StructureGrid can return as the fallback. StrictMode-safe: the boot
// effect guards with a cancelled flag and destroys on cleanup.

import { useEffect, useRef, useState } from "react";
import type { VistaHandle } from "../scene/bridge";
import type { SceneModel } from "../scene/sceneModel";

export function KingdomVista({
  model,
  onTravelerTap,
  onFail,
}: {
  model: SceneModel;
  onTravelerTap: (travelerId: string) => void;
  onFail: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VistaHandle | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [ready, setReady] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: boot exactly once — models and callbacks flow through refs
  useEffect(() => {
    let cancelled = false;
    let handle: VistaHandle | null = null;
    const parent = containerRef.current;
    if (parent === null) return;

    (async () => {
      const { createVista } = await import("../scene/boot");
      const h = await createVista(parent, modelRef.current, {
        onTravelerTap,
        onReady: () => {
          if (!cancelled) setReady(true);
        },
      });
      if (cancelled) {
        h.destroy();
        return;
      }
      handle = h;
      handleRef.current = h;
    })().catch(() => {
      if (!cancelled) onFail();
    });

    return () => {
      cancelled = true;
      handleRef.current = null;
      handle?.destroy();
    };
    // Boot exactly once; models flow through the handle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
