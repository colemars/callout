"use client";

import { Amount, Table, fmtMoney } from "@platform/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AgeBanner,
  Chronicle,
  MoatMeter,
  ResourceBars,
  StructureGrid,
  ThreatCards,
} from "../components/kingdom";
import { clients, supabase } from "../lib/clients";
import { narrateDelta } from "../lib/replay";
import { fetchLastSeen, saveLastSeen, shouldReplay } from "../lib/serverLastSeen";
import { translate } from "../lib/translate";
import { useKingdomData } from "../lib/useKingdomData";
import { type KingdomDelta, computeKingdomDiff } from "../model/diff";
import { kingdomModel } from "../model/kingdomModel";

export default function ThroneRoom() {
  const router = useRouter();
  const state = useKingdomData(clients);
  const [replay, setReplay] = useState<KingdomDelta[] | null>(null);

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
      }
      await saveLastSeen(clients.api, kingdom, lastSeen?.version).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [kingdom]);

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
          <h1 className="font-serif text-2xl font-bold tracking-tight">🏰 Financial Kingdom</h1>
          <p className="text-sm text-stone-500 dark:text-amber-200/60">
            Your kingdom is your balance sheet.
          </p>
        </div>
        <div className="flex items-baseline gap-4">
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
