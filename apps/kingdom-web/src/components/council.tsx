"use client";

// The Kingdom Council chamber: this week's counsel from the advisors, the
// quests the crown has backed (with live oracle readings), and recent
// resolutions. Backing is a promise to try — lapsing carries no penalty.
import {
  ADVISORS,
  type CouncilState,
  type OracleReading,
  type Quest,
  readOracle,
} from "../model/council";
import type { LedgerEvent } from "../model/economy";
import type { KingdomMetrics } from "../model/types";

const heading = "mb-3 font-serif text-lg font-semibold text-amber-900 dark:text-amber-200";
const card =
  "rounded-lg border border-amber-900/20 bg-amber-50/60 p-3 dark:border-amber-200/20 dark:bg-stone-900/60";
const muted = "text-stone-500 dark:text-amber-200/60";

export function CouncilChamber({
  council,
  metrics,
  events,
  onBack,
  busy,
  readOnly,
}: {
  council: CouncilState;
  metrics: KingdomMetrics | null;
  events: readonly LedgerEvent[];
  onBack: (proposalId: string) => void;
  busy: boolean;
  readOnly: boolean;
}) {
  const nothingToShow =
    council.proposals.length === 0 && council.active.length === 0 && council.resolved.length === 0;
  if (nothingToShow) return null;

  return (
    <section className="mt-8">
      <h2 className={heading}>🏛️ The Kingdom Council</h2>

      {council.active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {council.active.map((quest) => (
            <ActiveQuest
              key={quest.id}
              quest={quest}
              reading={readOracle(quest, metrics, events)}
            />
          ))}
        </ul>
      )}

      {council.proposals.length > 0 && (
        <>
          <p className={`mt-3 text-xs ${muted}`}>
            This week's counsel — back what the crown will pursue. Lapsing costs nothing.
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {council.proposals.map((p) => {
              const advisor = ADVISORS[p.advisor];
              return (
                <li key={p.id} className={card}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-sm font-semibold text-amber-900 dark:text-amber-200">
                      {advisor.icon} {p.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">+{p.reward} ✨</span>
                  </div>
                  <p className={`mt-1 text-xs ${muted}`}>
                    {advisor.name}: “{p.charge}”
                  </p>
                  <button
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => onBack(p.id)}
                    className="mt-2 rounded-lg border border-amber-900/25 px-2 py-0.5 text-xs hover:bg-amber-100 disabled:opacity-40 dark:border-amber-200/25 dark:hover:bg-amber-950"
                  >
                    Back this counsel
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {council.resolved.length > 0 && (
        <ul className={`mt-3 flex flex-col gap-1 text-xs ${muted}`}>
          {council.resolved.map((r) => (
            <li key={`${r.id}:${r.on}`}>
              {r.outcome === "fulfilled"
                ? `✓ ${ADVISORS[r.advisor].icon} “${r.title}” — fulfilled, +${r.reward} Influence.`
                : `— ${ADVISORS[r.advisor].icon} “${r.title}” lapsed, without penalty.`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActiveQuest({ quest, reading }: { quest: Quest; reading: OracleReading }) {
  const advisor = ADVISORS[quest.advisor];
  return (
    <li className={`${card} border-amber-800/40 dark:border-amber-200/35`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-sm font-semibold text-amber-900 dark:text-amber-200">
          {advisor.icon} {quest.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums">+{quest.reward} ✨</span>
      </div>
      <p className={`mt-1 text-xs ${muted}`}>{quest.charge}</p>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        {reading.progress} · until {quest.expiresOn}
      </p>
    </li>
  );
}
