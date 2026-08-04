"use client";

import { Amount, Table, fmtMoney } from "@platform/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  AgeBanner,
  Chronicle,
  MoatMeter,
  ResourceBars,
  StructureGrid,
  ThreatCards,
} from "../components/kingdom";
import { clients, supabase } from "../lib/clients";
import { translate } from "../lib/translate";
import { useKingdomData } from "../lib/useKingdomData";
import { kingdomModel } from "../model/kingdomModel";

export default function ThroneRoom() {
  const router = useRouter();
  const state = useKingdomData(clients);

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  const kingdom = useMemo(
    () => (state.status === "ready" ? kingdomModel(state.input, translate) : null),
    [state],
  );

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
        <button
          type="button"
          onClick={signOut}
          className="text-sm text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
        >
          abdicate
        </button>
      </header>

      {kingdom.surveying && (
        <p className="mt-6 rounded-lg border border-amber-900/20 bg-amber-100 p-3 text-sm dark:bg-amber-950">
          The royal surveyors have not yet mapped the realm — link a bank and let the first sync
          run.
        </p>
      )}

      <AgeBanner age={kingdom.age} />
      <ResourceBars resources={kingdom.resources} />
      <ThreatCards threats={kingdom.threats} />
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
