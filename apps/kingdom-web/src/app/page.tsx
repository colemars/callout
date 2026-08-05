"use client";

import { Amount, Table, fmtMoney } from "@platform/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type EconomyView, InfluenceChip, LedgerOfDeeds, ownedItems } from "../components/economy";
import {
  AgeBanner,
  Chronicle,
  MoatMeter,
  ResourceBars,
  StructureGrid,
  ThreatCards,
} from "../components/kingdom";
import { clients, supabase } from "../lib/clients";
import {
  type LoadedMeta,
  fetchEventsSince,
  fleeKingdom,
  loadOrFoundMeta,
  updateMeta,
} from "../lib/meta";
import { narrateDelta } from "../lib/replay";
import { fetchLastSeen, saveLastSeen, shouldReplay } from "../lib/serverLastSeen";
import { translate } from "../lib/translate";
import { useKingdomData } from "../lib/useKingdomData";
import { type KingdomDelta, computeKingdomDiff } from "../model/diff";
import { foldInfluence, influenceBalance, purchase } from "../model/economy";
import { kingdomModel } from "../model/kingdomModel";

/** Away this long, the crown is offered a fresh start alongside the replay. */
const FLEE_OFFER_GAP_MS = 60 * 24 * 60 * 60 * 1000;

export default function ThroneRoom() {
  const router = useRouter();
  const state = useKingdomData(clients);
  const [replay, setReplay] = useState<KingdomDelta[] | null>(null);
  const [economy, setEconomy] = useState<(EconomyView & { loaded: LoadedMeta }) | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [fleeOffered, setFleeOffered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  const kingdom = useMemo(
    () => (state.status === "ready" ? kingdomModel(state.input, translate) : null),
    [state],
  );

  // "While you were away": diff against the server-held baseline (the state
  // last acknowledged on ANY device), but only after a real absence — a
  // same-day revisit is not worth narrating. The baseline advances on every
  // view; a 409 on save means another device just advanced it — ignore.
  useEffect(() => {
    if (kingdom === null || kingdom.surveying) return;
    let cancelled = false;
    (async () => {
      const lastSeen = await fetchLastSeen(clients.api).catch(() => null);
      if (cancelled) return;
      if (lastSeen !== null && shouldReplay(lastSeen.lastSeenAt, Date.now())) {
        setReplay(computeKingdomDiff(lastSeen.state, kingdom));
        // A LONG absence earns the offer of a fresh start — alongside the
        // replay, never instead of it.
        if (Date.now() - lastSeen.lastSeenAt >= FLEE_OFFER_GAP_MS) setFleeOffered(true);
      }
      await saveLastSeen(clients.api, kingdom, lastSeen?.version).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [kingdom]);

  // The Influence economy: load (or found) the meta record, then fold the
  // reign's events into the balance. Pure fold — full replay every open.
  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadOrFoundMeta(clients.api, state.input.metrics);
        const events = await fetchEventsSince(clients.api, loaded.meta.epoch.epochSeq);
        if (cancelled) return;
        setEconomy({
          loaded,
          meta: loaded.meta,
          fold: foldInfluence(events, loaded.meta.epoch.epochSeq),
          readOnly: loaded.readOnly,
        });
      } catch {
        // The economy failing to load never blocks the throne room.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  async function handlePurchase(itemId: string) {
    if (economy === null || busy) return;
    setBusy(true);
    try {
      const result = await updateMeta(clients.api, economy.loaded, (meta) =>
        purchase(meta, itemId, influenceBalance(meta, economy.fold), new Date().toISOString()),
      );
      if (result !== null) {
        setEconomy({ loaded: result, meta: result.meta, fold: economy.fold, readOnly: false });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleFlee() {
    if (economy === null || state.status !== "ready" || busy) return;
    setBusy(true);
    try {
      const result = await fleeKingdom(clients.api, economy.loaded, state.input.metrics);
      if (result !== null) {
        setEconomy({
          loaded: result,
          meta: result.meta,
          fold: { influence: 0, grants: [] },
          readOnly: false,
        });
        setReplay(null);
        setFleeOffered(false);
        setLedgerOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (state.status === "error") {
    return <main className="p-8 text-red-700">A raven brings ill news: {state.message}</main>;
  }
  if (state.status !== "ready" || kingdom === null) {
    return <main className="p-8 text-stone-500">The scribes are tallying…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">
            🏰 Financial Kingdom
            {economy !== null &&
              ownedItems(economy.meta)
                .filter((i) => i.emblem !== "")
                .map((i) => (
                  <span key={i.id} title={i.name}>
                    {" "}
                    {i.emblem}
                  </span>
                ))}
          </h1>
          <p className="text-sm text-stone-500 dark:text-amber-200/60">
            Your kingdom is your balance sheet.
            {economy !== null &&
              (() => {
                const titles = ownedItems(economy.meta)
                  .filter((i) => i.title !== "")
                  .map((i) => i.title);
                return titles.length > 0 ? ` The crown is styled ${titles.join(", ")}.` : "";
              })()}
          </p>
        </div>
        <div className="flex items-baseline gap-4">
          {economy !== null && <InfluenceChip view={economy} onOpen={() => setLedgerOpen(true)} />}
          <Link
            href="/decrees/"
            className="text-sm text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
          >
            📜 decrees
          </Link>
          <Link
            href="/banks/"
            className="text-sm text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
          >
            🏦 counting house
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
          >
            abdicate
          </button>
        </div>
      </header>

      {kingdom.surveying && (
        <p className="mt-6 rounded-lg border border-amber-900/20 bg-amber-100 p-3 text-sm dark:bg-amber-950">
          The royal surveyors have not yet mapped the realm — link a bank and let the first sync
          run.
        </p>
      )}

      {fleeOffered && economy !== null && (
        <section className="mt-6 rounded-lg border border-amber-900/20 bg-amber-100/60 p-3 text-sm dark:border-amber-200/20 dark:bg-amber-950/40">
          <span className="font-serif font-semibold text-amber-900 dark:text-amber-200">
            The crown has been long away.
          </span>{" "}
          <span className={"text-stone-600 dark:text-amber-200/70"}>
            The realm stands as you left it — or, if the weight of the old reign is too much, you
            may{" "}
            <button
              type="button"
              onClick={() => setLedgerOpen(true)}
              className="underline hover:text-amber-800"
            >
              abandon the kingdom and flee
            </button>{" "}
            to found a new one.
          </span>
        </section>
      )}

      {replay !== null && replay.length > 0 && (
        <section className="mt-6 rounded-lg border border-amber-900/20 bg-amber-100/60 p-3 dark:border-amber-200/20 dark:bg-amber-950/40">
          <h2 className="font-serif text-sm font-semibold text-amber-900 dark:text-amber-200">
            While you were away
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {replay
              .map((d) => narrateDelta(d))
              .filter((n) => n !== null)
              .slice(0, 8)
              .map((n, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: display-only lines
                  key={i}
                  className={`text-sm ${
                    n.tone === "good"
                      ? "text-emerald-800 dark:text-emerald-300"
                      : n.tone === "bad"
                        ? "text-red-800 dark:text-red-300"
                        : ""
                  }`}
                >
                  {n.text}
                </li>
              ))}
          </ul>
        </section>
      )}

      {ledgerOpen && economy !== null && (
        <LedgerOfDeeds
          view={economy}
          onClose={() => setLedgerOpen(false)}
          onPurchase={handlePurchase}
          onFlee={handleFlee}
          busy={busy}
        />
      )}

      <AgeBanner age={kingdom.age} />
      <ResourceBars resources={kingdom.resources} />
      <ThreatCards threats={kingdom.threats} transactions={state.input.transactions} />
      <MoatMeter moat={kingdom.moat} />
      <StructureGrid structures={kingdom.structures} />
      <Chronicle entries={kingdom.chronicle} />

      <details className="mt-10">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-amber-900 dark:text-amber-200">
          The Scribes' Ledger (raw records)
        </summary>
        <section className="mt-3">
          <h3 className="mb-2 text-sm font-medium">Accounts</h3>
          <Table
            borderClassName="border-amber-900/15 dark:border-amber-200/15"
            rows={state.input.accounts.map((a) => [
              <div key={a.id} className="whitespace-normal">
                <div>
                  {a.name}
                  {a.mask ? ` ···${a.mask}` : ""}
                </div>
                <div className="text-xs text-stone-500 dark:text-amber-200/60">
                  {a.institution} · {a.kind}
                </div>
              </div>,
              <Amount key={`${a.id}-balance`} m={a.balance} />,
            ])}
            empty="No vaults sworn to the crown yet."
          />
          <h3 className="mt-4 mb-2 text-sm font-medium">Recent ledger lines</h3>
          <Table
            borderClassName="border-amber-900/15 dark:border-amber-200/15"
            rows={state.input.transactions.slice(0, 20).map((t) => [
              <span key={t.id} className="text-stone-500 dark:text-amber-200/60">
                {t.postedAt.slice(5)}
              </span>,
              <div key={`${t.id}-what`} className="whitespace-normal">
                <div>{t.merchant ?? t.description}</div>
                <div className="text-xs text-stone-500 dark:text-amber-200/60">{t.category}</div>
              </div>,
              <span
                key={`${t.id}-amt`}
                className={t.amount.amountMinor > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}
              >
                {fmtMoney(t.amount)}
              </span>,
            ])}
            empty="The ledger awaits its first entry."
          />
        </section>
      </details>
    </main>
  );
}
