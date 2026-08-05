"use client";

// Unlisted renderer test bench: the Vista fed a fixed FIXTURE SceneModel —
// no auth, no API, no real data. Exists so canvas changes can be verified
// (by humans and by the build pipeline) without a logged-in session.
import { useState } from "react";
import { KingdomVista } from "../../components/vista";
import type { SceneModel } from "../../scene/sceneModel";

const DEMO: SceneModel = {
  surveying: false,
  ageId: 2,
  structures: (
    [
      ["keep", 2, {}],
      ["granary", 1, {}],
      ["walls", 1, {}],
      ["treasury", 3, { locked: true }],
      ["market", 2, {}],
      ["festival", 1, {}],
      ["caravans", 2, {}],
      ["manor", 2, { lien: true }],
      ["oaths", 3, {}],
      ["banditCamp", 3, { hostile: true }],
    ] as const
  ).map(([key, artTier, flags]) => ({
    key,
    slotId: `slot-${key}`,
    artTier: artTier as 1 | 2 | 3,
    state: {
      key,
      name: `The ${key}`,
      icon: "🏰",
      exists: true,
      level: (artTier * 2 - 1) as 1 | 3 | 5,
      value: null,
      unit: "count" as const,
      detail: "A fixture structure for the renderer test bench.",
      lines: [
        { label: "fixture entries", heading: true },
        { label: "a steady sum", value: "$123.45", note: "on pace", tone: "good" as const },
        { label: "a wobbling sum", value: "$67.89", note: "⚠ straying", tone: "warn" as const },
      ],
      basis: "hand-written fixture data — nothing real",
      ...flags,
    },
  })),
  reservedPlots: ["plot-a", "plot-b", "plot-c"],
  travelers: [
    {
      id: "merchant:NETFLIX",
      roadId: "north",
      t: 0.5,
      gateSlot: null,
      archetype: "merchant",
      tone: "neutral",
      ghosted: false,
      agitated: false,
      name: "NETFLIX",
      arrivalCopy: "arrives in 15 days",
    },
    {
      id: "due:card-1",
      roadId: "west",
      t: 1,
      gateSlot: 0,
      archetype: "official",
      tone: "hostile",
      ghosted: false,
      agitated: true,
      name: "Chase collector",
      arrivalCopy: "waits at the gates",
    },
    {
      id: "income:ACME PAYROLL",
      roadId: "east",
      t: 0.85,
      gateSlot: null,
      archetype: "merchant",
      tone: "friendly",
      ghosted: false,
      agitated: false,
      name: "ACME PAYROLL",
      arrivalCopy: "arrives in 4 days",
    },
    {
      id: "merchant:OLDGYM",
      roadId: "north",
      t: 1,
      gateSlot: 1,
      archetype: "guest",
      tone: "neutral",
      ghosted: true,
      agitated: false,
      name: "OLDGYM",
      arrivalCopy: "the road has gone quiet",
    },
  ],
  weather: { winter: 2 },
  ambientCount: 12,
};

export default function VistaDemo() {
  const [tapped, setTapped] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-serif text-xl font-bold">Vista test bench (fixture data)</h1>
      <KingdomVista
        model={DEMO}
        onTravelerTap={setTapped}
        onFail={() => setTapped("BOOT FAILED")}
      />
      <p className="mt-3 text-sm text-stone-500" data-testid="tap-result">
        last traveler tap: {tapped ?? "none"}
      </p>
    </main>
  );
}
