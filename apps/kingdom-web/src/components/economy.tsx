"use client";

// The Influence economy surface: the balance chip in the throne-room header,
// the Ledger of Deeds (every grant, spend, and the founding endowment), the
// Royal Herald's cosmetics stall, and the flee-the-kingdom ceremony.
import { useState } from "react";
import {
  type CatalogItem,
  type FoldResult,
  type KingdomMeta,
  SPEND_CATALOG,
  influenceBalance,
} from "../model/economy";

const muted = "text-stone-500 dark:text-amber-200/60";
const rule = "border-t border-amber-900/15 dark:border-amber-200/15";

export interface EconomyView {
  meta: KingdomMeta;
  fold: FoldResult;
  readOnly: boolean;
}

export function ownedItems(meta: KingdomMeta): CatalogItem[] {
  return SPEND_CATALOG.filter((i) => meta.unlocks.includes(i.id));
}

export function InfluenceChip({ view, onOpen }: { view: EconomyView; onOpen: () => void }) {
  const balance = influenceBalance(view.meta, view.fold);
  return (
    <button
      type="button"
      onClick={onOpen}
      title="The Ledger of Deeds"
      className="rounded-full border border-amber-900/25 bg-amber-100/70 px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-200/25 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-950"
    >
      ✨ {balance.toLocaleString("en-US")} Influence
    </button>
  );
}

export function LedgerOfDeeds({
  view,
  onClose,
  onPurchase,
  onFlee,
  busy,
}: {
  view: EconomyView;
  onClose: () => void;
  onPurchase: (itemId: string) => void;
  onFlee: () => void;
  busy: boolean;
}) {
  const [fleeing, setFleeing] = useState(false);
  const { meta, fold } = view;
  const balance = influenceBalance(meta, fold);
  const spent = meta.spends.reduce((sum, s) => sum + s.influence, 0);
  const deeds = [...fold.grants].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close the ledger"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <dialog
        open
        aria-label="The Ledger of Deeds"
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-900/25 bg-amber-50 p-5 text-inherit shadow-2xl dark:border-amber-200/25 dark:bg-stone-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none" aria-hidden>
              ✨
            </span>
            <div>
              <h3 className="font-serif text-lg font-bold text-amber-900 dark:text-amber-200">
                The Ledger of Deeds
              </h3>
              <p className={`text-xs ${muted}`}>
                Influence is earned by deeds, never bought with coin.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`text-sm underline ${muted}`}>
            close
          </button>
        </div>

        <div className={`mt-4 flex items-baseline justify-between pt-3 text-sm ${rule}`}>
          <span>The crown's standing</span>
          <span className="font-semibold tabular-nums">
            {balance.toLocaleString("en-US")} Influence
          </span>
        </div>
        <p className={`mt-0.5 text-xs ${muted}`}>
          {meta.endowment.influence.toLocaleString("en-US")} endowed at founding ·{" "}
          {fold.influence.toLocaleString("en-US")} earned by deeds
          {spent > 0 ? ` · ${spent.toLocaleString("en-US")} spent` : ""}
          {meta.epoch.fleeCount > 0 ? ` · reign ${meta.epoch.fleeCount + 1} of this crown` : ""}
        </p>
        {view.readOnly && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            This ledger was written by a newer scribe — spending is sealed here until the page is
            refreshed to match.
          </p>
        )}

        <h4
          className={`mt-4 pt-3 font-serif text-xs font-semibold uppercase tracking-wide ${muted} ${rule}`}
        >
          Deeds of this reign
        </h4>
        {deeds.length === 0 ? (
          <p className={`mt-2 text-sm ${muted}`}>
            None yet — the chronicle will record them as they happen.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {deeds.slice(0, 20).map((g) => (
              <li key={g.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">{g.deed}</span>
                <span className="shrink-0 tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{g.influence}
                </span>
              </li>
            ))}
          </ul>
        )}

        {meta.endowment.grants.length > 0 && (
          <>
            <h4
              className={`mt-4 pt-3 font-serif text-xs font-semibold uppercase tracking-wide ${muted} ${rule}`}
            >
              The founding endowment
            </h4>
            <p className={`mt-1 text-xs ${muted}`}>
              Your reputation preceded you — deeds earn more.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {meta.endowment.grants.map((g) => (
                <li key={g.kind} className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 ${muted}`}>{g.evidence}</span>
                  <span className="shrink-0 tabular-nums">+{g.influence}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4
          className={`mt-4 pt-3 font-serif text-xs font-semibold uppercase tracking-wide ${muted} ${rule}`}
        >
          The Royal Herald's stall
        </h4>
        <p className={`mt-1 text-xs ${muted}`}>
          Banners and styles for the crown — finery only, never power.
        </p>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {SPEND_CATALOG.map((item) => {
            const owned = meta.unlocks.includes(item.id);
            const affordable = balance >= item.price;
            return (
              <li key={item.id} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span>
                    {item.emblem !== "" ? `${item.emblem} ` : ""}
                    {item.name}
                  </span>
                  <p className={`text-xs ${muted}`}>{item.flavor}</p>
                </div>
                {owned ? (
                  <span className={`shrink-0 text-xs ${muted}`}>owned</span>
                ) : (
                  <button
                    type="button"
                    disabled={!affordable || busy || view.readOnly}
                    onClick={() => onPurchase(item.id)}
                    className="shrink-0 rounded-lg border border-amber-900/25 px-2 py-0.5 text-xs tabular-nums hover:bg-amber-100 disabled:opacity-40 dark:border-amber-200/25 dark:hover:bg-amber-950"
                  >
                    {item.price} ✨
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className={`mt-5 pt-3 ${rule}`}>
          {fleeing ? (
            <div className="rounded-lg border border-red-800/30 bg-red-50/60 p-3 text-sm dark:border-red-400/25 dark:bg-red-950/30">
              <p className="font-serif font-semibold text-red-800 dark:text-red-300">
                Abandon the kingdom and flee?
              </p>
              <p className={`mt-1 text-xs ${muted}`}>
                A new reign begins somewhere else: Influence, banners, and styles stay behind with
                the old crown, and a fresh (smaller) endowment is struck from what you hold today.
                Your real accounts and ledgers are untouched — you cannot flee your debts.
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  disabled={busy || view.readOnly}
                  onClick={onFlee}
                  className="rounded-lg bg-red-800 px-3 py-1 text-xs font-medium text-red-50 hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Riding for the border…" : "Flee the kingdom"}
                </button>
                <button
                  type="button"
                  onClick={() => setFleeing(false)}
                  className={`text-xs underline ${muted}`}
                >
                  remain
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFleeing(true)}
              className={`text-xs underline ${muted}`}
            >
              🐎 Abandon kingdom and flee…
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
