"use client";

import { useState } from "react";
import { monthName } from "../model/derive";
import type {
  AgeState,
  ChronicleEntry,
  KingdomTxn,
  MoatState,
  ResourceState,
  StructureState,
  ThreatState,
} from "../model/types";

const heading = "mb-3 font-serif text-lg font-semibold text-amber-900 dark:text-amber-200";
const card =
  "rounded-lg border border-amber-900/15 bg-white p-3 dark:border-amber-200/15 dark:bg-stone-900";
const muted = "text-stone-500 dark:text-amber-200/60";

const fmtUsd = (minor: number): string =>
  (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function Pips({ level, hostile = false }: { level: number; hostile?: boolean | undefined }) {
  return (
    <span
      className={`tabular-nums ${hostile ? "text-red-700" : "text-amber-700 dark:text-amber-400"}`}
    >
      {"●".repeat(level)}
      <span className="opacity-25">{"●".repeat(Math.max(0, 5 - level))}</span>
    </span>
  );
}

export function AgeBanner({ age }: { age: AgeState }) {
  return (
    <section className={`mt-6 ${card}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-bold">
          {age.icon} Age {age.current} — {age.name}
        </h2>
        {age.provisional && <span className={`text-xs ${muted}`}>first moon still open</span>}
      </div>
      <p className={`mt-1 text-sm ${muted}`}>{age.tagline}</p>
      {age.gatesToNext !== null && (
        <div className="mt-3">
          <p className="text-sm font-medium">What advances the realm:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {age.gatesToNext.map((g) => (
              <li key={g.id} className="text-sm">
                <span
                  className={
                    g.passed
                      ? "text-emerald-700"
                      : g.provisional
                        ? "text-stone-400"
                        : "text-red-700"
                  }
                >
                  {g.passed ? "✓" : g.provisional ? "◌" : "✗"}
                </span>{" "}
                {g.themedLabel}
                <span className={`ml-2 text-xs ${muted}`}>{g.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ResourceBars({ resources }: { resources: ResourceState[] }) {
  return (
    <section className="mt-8">
      <h2 className={heading}>The realm's resources</h2>
      <ul className="flex flex-col gap-2">
        {resources.map((r) => (
          <li key={r.key} className="flex items-baseline gap-3 text-sm" title={r.basis}>
            <span className="w-28 shrink-0">
              {r.icon} {r.themeName}
            </span>
            <Pips level={r.level} />
            <span className="min-w-0 flex-1 truncate text-right">
              {r.displayValue}
              {r.provisional && <span className={`ml-1 ${muted}`}>*</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs ${muted}`}>* judged before the first full moon has closed</p>
    </section>
  );
}

interface LedgerView {
  category: string;
  months: { current: string; previous: string };
}

/** The ledger behind a breakdown line: real transactions, month by month. */
function LedgerModal({
  view,
  transactions,
  onClose,
}: {
  view: LedgerView;
  transactions: KingdomTxn[];
  onClose: () => void;
}) {
  const inMonth = (month: string) =>
    transactions
      .filter((t) => t.category === view.category && t.postedAt.startsWith(month))
      .sort((a, b) => Math.abs(b.amount.amountMinor) - Math.abs(a.amount.amountMinor));

  const section = (month: string, label: string) => {
    const rows = inMonth(month);
    const total = rows.reduce((sum, t) => sum + t.amount.amountMinor, 0);
    return (
      <section className="mt-3">
        <h4 className="flex justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
          <span>
            {label} ({month})
          </span>
          <span className="tabular-nums">{fmtUsd(Math.abs(total))}</span>
        </h4>
        {rows.length === 0 ? (
          <p className={`mt-1 text-xs ${muted}`}>No ledger lines within the scrolls' reach.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {rows.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className={muted}>{t.postedAt.slice(5)}</span> {t.merchant ?? t.description}
                </span>
                <span className="shrink-0 tabular-nums">{fmtUsd(t.amount.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close the ledger"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <dialog
        open
        aria-label={`Ledger: ${view.category}`}
        className="relative z-10 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-amber-900/20 bg-amber-50 p-4 text-inherit dark:border-amber-200/20 dark:bg-stone-900"
      >
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-base font-semibold text-amber-900 dark:text-amber-200">
            The ledger: {view.category}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`text-sm underline ${muted}`}
            aria-label="Close"
          >
            close
          </button>
        </div>
        {section(view.months.current, monthName(view.months.current))}
        {section(view.months.previous, monthName(view.months.previous))}
        <p className={`mt-3 text-xs ${muted}`}>
          The scrolls reach back ~70 days — the elder moon may be partly beyond them. Wrongly marked
          lines can be corrected in the Accountability ledger.
        </p>
      </dialog>
    </div>
  );
}

export function ThreatCards({
  threats,
  transactions,
}: {
  threats: ThreatState[];
  transactions: KingdomTxn[];
}) {
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const active = threats.filter((t) => t.active);
  if (active.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className={heading}>Threats to the realm</h2>
      <ul className="flex flex-col gap-2">
        {active.map((t) => (
          <li
            key={t.kind}
            className="rounded-lg border border-red-800/40 bg-red-50 p-3 text-sm dark:bg-red-950"
          >
            <p className="font-medium">
              {"⚠️".repeat(t.severity)} {t.title}
            </p>
            <p className="mt-1">{t.narrative}</p>
            {t.causes.length > 0 && (
              <ul className={`mt-1 flex flex-col gap-0.5 text-xs ${muted}`}>
                {t.causes.map((c) => (
                  <li key={c.label} className="flex justify-between gap-4">
                    <span className="min-w-0">{c.label}</span>
                    {c.amount && (
                      <span className="shrink-0 tabular-nums">
                        {fmtUsd(Math.abs(c.amount.amountMinor))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {t.breakdown !== undefined && t.breakdown.length > 0 && (
              <details className="mt-2">
                <summary className={`cursor-pointer text-xs ${muted}`}>
                  the ledger's account, line by line
                </summary>
                {t.months !== undefined && (
                  <p className={`mt-1 text-right text-xs ${muted}`}>
                    {monthName(t.months.previous)} → {monthName(t.months.current)} · change
                  </p>
                )}
                <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                  {t.breakdown.map((line) => {
                    const worsened = line.risingIsGood ? line.deltaMinor < 0 : line.deltaMinor > 0;
                    return (
                      <li key={line.label} className="flex justify-between gap-4 tabular-nums">
                        {t.months !== undefined ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLedger({
                                category: line.label,
                                months: t.months as LedgerView["months"],
                              })
                            }
                            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-amber-800 dark:hover:text-amber-200"
                            title="Open the ledger"
                          >
                            {line.label}
                          </button>
                        ) : (
                          <span>{line.label}</span>
                        )}
                        <span>
                          {fmtUsd(line.previousMinor)} → {fmtUsd(line.currentMinor)}{" "}
                          <span
                            className={
                              worsened
                                ? "text-red-700 dark:text-red-400"
                                : "text-emerald-700 dark:text-emerald-400"
                            }
                          >
                            {line.deltaMinor >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(line.deltaMinor))}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      {ledger !== null && (
        <LedgerModal view={ledger} transactions={transactions} onClose={() => setLedger(null)} />
      )}
    </section>
  );
}

export function MoatMeter({ moat }: { moat: MoatState }) {
  return (
    <section className="mt-8">
      <h2 className={heading}>The moat — margin of safety</h2>
      <div className={card}>
        <div className="flex items-baseline justify-between">
          <p className="font-medium">{moat.tierLabel}</p>
          <p className="tabular-nums text-sm">{moat.score}/100</p>
        </div>
        <div className="mt-2 h-3 rounded bg-amber-900/10 dark:bg-amber-200/10">
          <div className="h-3 rounded bg-sky-600" style={{ width: `${moat.score}%` }} />
        </div>
        {moat.cappedByBandits && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">
            Bandits can bridge any moat — held at {moat.score} until the raiders are driven out
            (would be {moat.uncapped}).
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {moat.components.map((c) => (
            <li key={c.key} className="flex items-baseline justify-between gap-3">
              <span>{c.label}</span>
              <span className={`min-w-0 flex-1 truncate text-right text-xs ${muted}`}>
                {c.evidence}
              </span>
              <span className="tabular-nums">
                {c.score}/{c.max}
              </span>
            </li>
          ))}
        </ul>
        <p className={`mt-2 text-xs ${muted}`}>
          The chroniclers do not yet record the realm's wards (insurance) or the variety of its
          tribute (income diversification).
        </p>
      </div>
    </section>
  );
}

export function StructureGrid({ structures }: { structures: StructureState[] }) {
  return (
    <section className="mt-8">
      <h2 className={heading}>The kingdom</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {structures
          .filter((s) => s.exists)
          .map((s) => (
            <div key={s.key} className={`${card} ${s.hostile ? "border-red-800/40" : ""}`}>
              <div className="flex items-baseline justify-between">
                <p className="font-medium">
                  {s.icon} {s.name}
                  {s.locked && <span title="sealed until old age"> 🔒</span>}
                  {s.lien && <span title="pledged to the bank"> 🏦</span>}
                </p>
                <Pips level={s.level} hostile={s.hostile} />
              </div>
              <p className={`mt-1 text-xs ${muted}`}>{s.detail}</p>
            </div>
          ))}
      </div>
    </section>
  );
}

export function Chronicle({ entries }: { entries: ChronicleEntry[] }) {
  return (
    <section className="mt-8">
      <h2 className={heading}>The chronicle</h2>
      {entries.length === 0 ? (
        <p className={`text-sm ${muted}`}>The scribes report a quiet realm.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.refId} className="flex items-baseline gap-2 text-sm">
              <span className={`shrink-0 tabular-nums text-xs ${muted}`}>{e.date.slice(5)}</span>
              <span>{e.icon}</span>
              <span
                className={
                  e.tone === "bad"
                    ? "text-red-700 dark:text-red-400"
                    : e.tone === "good"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : ""
                }
              >
                {e.headline}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
