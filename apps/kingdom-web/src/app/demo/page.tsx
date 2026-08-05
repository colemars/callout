"use client";

// Unlisted renderer test bench: the Vista fed a fixed FIXTURE SceneModel —
// no auth, no API, no real data. Exists so canvas changes can be verified
// (by humans and by the build pipeline) without a logged-in session.
import { useState } from "react";
import { KingdomVista } from "../../components/vista";
import type { ReplayMoment, SceneModel } from "../../scene/sceneModel";

const FIXTURE_TRAVELER = {
  roleAssigned: false,
  icon: "🧳",
  etaDays: 5,
  arrivesOn: "2026-08-10",
  cadence: "comes every 30 days or so",
  basis: "hand-written fixture data — nothing real",
} as const;

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
      state: {
        ...FIXTURE_TRAVELER,
        id: "merchant:NETFLIX",
        source: "recurring",
        name: "NETFLIX",
        role: "players",
        tone: "neutral",
        status: "approaching",
        amount: { amountMinor: 17_99, currency: "USD" },
        arrivalCopy: "arrives in 15 days",
      },
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
      state: {
        ...FIXTURE_TRAVELER,
        id: "due:card-1",
        source: "due",
        name: "Chase collector",
        role: "loansharks",
        roleAssigned: true,
        tone: "hostile",
        status: "overdue",
        amount: { amountMinor: 40_00, currency: "USD" },
        arrivalCopy: "waits at the gates",
        cadence: "a due date the bank has set",
      },
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
      state: {
        ...FIXTURE_TRAVELER,
        id: "income:ACME PAYROLL",
        source: "income",
        name: "ACME PAYROLL",
        role: "provisioner",
        tone: "friendly",
        status: "approaching",
        amount: { amountMinor: 2_400_00, currency: "USD" },
        arrivalCopy: "arrives in 4 days",
      },
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
      state: {
        ...FIXTURE_TRAVELER,
        id: "merchant:OLDGYM",
        source: "recurring",
        name: "OLDGYM",
        role: "visitor",
        tone: "neutral",
        status: "quiet",
        arrivalCopy: "the road has gone quiet",
      },
    },
  ],
  weather: { winter: 2 },
  ambientCount: 12,
  registryReadOnly: false,
};

const DEMO_REEL: ReplayMoment[] = [
  { at: "sky", caption: "A new age dawns: Age of Timber", tone: "good" },
  { at: "granary", caption: "The Granary grows", tone: "good" },
  { at: "banditCamp", caption: "The raiders press the walls", tone: "bad" },
];

export default function VistaDemo() {
  const [action, setAction] = useState<string | null>(null);
  const [reel, setReel] = useState<ReplayMoment[] | null>(null);
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-serif text-xl font-bold">Vista test bench (fixture data)</h1>
      <KingdomVista
        model={DEMO}
        replay={reel}
        onAssignRole={(id, role) => setAction(`assign ${role} to ${id}`)}
        onClearRole={(id) => setAction(`clear ${id}`)}
        onFail={() => setAction("BOOT FAILED")}
      />
      <button
        type="button"
        onClick={() => setReel([...DEMO_REEL])}
        className="mt-3 rounded-lg border border-amber-900/25 px-3 py-1 text-sm"
        data-testid="play-reel"
      >
        play replay reel
      </button>
      <p className="mt-3 text-sm text-stone-500" data-testid="tap-result">
        last registry action: {action ?? "none"}
      </p>
    </main>
  );
}
