"use client";

// The Roads: approaching financial traffic, sorted by arrival. Clicking a
// traveler opens the Road Registry — the crown names each visitor's role.
// Every default is neutral; hostility only by decree. A card can appear
// twice (a bank due date AND an observed payment habit) — two real facts,
// shown honestly; no reliable automatic link exists.
import { useState } from "react";
import {
  ROLE_CATALOG,
  type RoadsState,
  type RoleId,
  type TravelerState,
  fmtAmount,
  roleFor,
} from "../model/roads";

const heading = "mb-3 font-serif text-lg font-semibold text-amber-900 dark:text-amber-200";
const muted = "text-stone-500 dark:text-amber-200/60";
const rule = "border-t border-amber-900/15 dark:border-amber-200/15";

export function TheRoads({
  roads,
  onAssign,
  onClear,
  busy,
  readOnly,
}: {
  roads: RoadsState;
  onAssign: (travelerId: string, roleId: RoleId) => void;
  onClear: (travelerId: string) => void;
  busy: boolean;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (roads.travelers.length === 0) return null;
  const openTraveler = roads.travelers.find((t) => t.id === open) ?? null;

  return (
    <section className="mt-8">
      <h2 className={heading}>🛤️ The Roads</h2>
      <p className={`-mt-2 mb-3 text-xs ${muted}`}>
        Who approaches the kingdom, and when. Click a traveler to name their role.
      </p>
      <ul className="flex flex-col gap-1.5">
        {roads.travelers.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(t.id)}
              className={`w-full rounded-lg border p-2.5 text-left transition hover:bg-amber-100/60 dark:hover:bg-amber-950/40 ${
                t.tone === "hostile"
                  ? "border-red-800/40 bg-red-50/40 dark:border-red-400/30 dark:bg-red-950/20"
                  : t.tone === "friendly"
                    ? "border-emerald-800/30 bg-emerald-50/40 dark:border-emerald-400/25 dark:bg-emerald-950/20"
                    : "border-amber-900/20 bg-amber-50/60 dark:border-amber-200/20 dark:bg-stone-900/60"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  <span aria-hidden>{t.icon}</span> {t.name}
                </span>
                {t.amount !== undefined && (
                  <span className="shrink-0 text-sm tabular-nums">
                    {t.source === "income" ? "+" : ""}
                    {fmtAmount(t.amount)}
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-xs ${muted}`}>
                {roleFor(t.role).name}
                {t.roleAssigned ? "" : " (unnamed)"} · {t.cadence}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  t.status === "overdue"
                    ? "text-red-700 dark:text-red-400"
                    : t.status === "at-gates"
                      ? "text-amber-700 dark:text-amber-400"
                      : t.status === "quiet"
                        ? muted
                        : "text-stone-600 dark:text-amber-200/70"
                }`}
              >
                {t.arrivalCopy}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {openTraveler !== null && (
        <RoadRegistryModal
          traveler={openTraveler}
          onAssign={onAssign}
          onClear={onClear}
          onClose={() => setOpen(null)}
          busy={busy}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}

function RoadRegistryModal({
  traveler,
  onAssign,
  onClear,
  onClose,
  busy,
  readOnly,
}: {
  traveler: TravelerState;
  onAssign: (travelerId: string, roleId: RoleId) => void;
  onClear: (travelerId: string) => void;
  onClose: () => void;
  busy: boolean;
  readOnly: boolean;
}) {
  const ordinary = ROLE_CATALOG.filter((r) => r.byDecreeOnly !== true);
  const byDecree = ROLE_CATALOG.filter((r) => r.byDecreeOnly === true);
  const locked = busy || readOnly;

  const roleButton = (r: (typeof ROLE_CATALOG)[number]) => (
    <button
      key={r.id}
      type="button"
      disabled={locked || (traveler.roleAssigned && traveler.role === r.id)}
      onClick={() => onAssign(traveler.id, r.id)}
      title={r.charge}
      className={`rounded-lg border px-2 py-1.5 text-left text-xs transition disabled:opacity-60 ${
        traveler.roleAssigned && traveler.role === r.id
          ? "border-amber-800/60 bg-amber-100 font-semibold dark:border-amber-200/50 dark:bg-amber-950"
          : "border-amber-900/20 hover:bg-amber-100/60 dark:border-amber-200/20 dark:hover:bg-amber-950/40"
      }`}
    >
      <span aria-hidden>{r.icon}</span> {r.name}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close the registry"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <dialog
        open
        aria-label={`${traveler.name} — the Road Registry`}
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-900/25 bg-amber-50 p-5 text-inherit shadow-2xl dark:border-amber-200/25 dark:bg-stone-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none" aria-hidden>
              {traveler.icon}
            </span>
            <div>
              <h3 className="font-serif text-lg font-bold text-amber-900 dark:text-amber-200">
                {traveler.name}
              </h3>
              <p className={`text-xs ${muted}`}>The Road Registry</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`text-sm underline ${muted}`}>
            close
          </button>
        </div>

        <ul className={`mt-4 flex flex-col gap-1.5 pt-3 text-sm ${rule}`}>
          <li className="flex items-baseline justify-between gap-3">
            <span>Arrival</span>
            <span className="shrink-0 text-right">{traveler.arrivalCopy}</span>
          </li>
          {traveler.amount !== undefined && (
            <li className="flex items-baseline justify-between gap-3">
              <span>{traveler.source === "income" ? "Brings" : "Takes"}</span>
              <span className="shrink-0 tabular-nums">{fmtAmount(traveler.amount)}</span>
            </li>
          )}
          <li className="flex items-baseline justify-between gap-3">
            <span>Cadence</span>
            <span className={`shrink-0 text-right text-xs ${muted}`}>{traveler.cadence}</span>
          </li>
        </ul>

        <h4
          className={`mt-4 pt-3 font-serif text-xs font-semibold uppercase tracking-wide ${muted} ${rule}`}
        >
          Name this visitor
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-1.5">{ordinary.map(roleButton)}</div>
        <h4 className={`mt-3 font-serif text-xs font-semibold uppercase tracking-wide ${muted}`}>
          By decree of the crown
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-1.5">{byDecree.map(roleButton)}</div>
        {traveler.roleAssigned && (
          <button
            type="button"
            disabled={locked}
            onClick={() => onClear(traveler.id)}
            className={`mt-2 text-xs underline disabled:opacity-50 ${muted}`}
          >
            let the visitor pass unnamed
          </button>
        )}

        <p className={`mt-4 pt-3 text-xs ${muted} ${rule}`}>
          The registry names the visitor; it does not bar the gate. To close a road, speak with the
          bank or the merchant — when a tithe ends, its road falls quiet on its own.
        </p>
        <p className={`mt-2 text-xs italic ${muted}`}>Per the royal surveyors: {traveler.basis}.</p>
      </dialog>
    </div>
  );
}
