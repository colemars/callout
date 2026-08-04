"use client";

import { Amount, Section, Table, fmtMoney, useDashboardData } from "@platform/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clients, supabase } from "../lib/clients";
import { translate } from "../lib/translate";

const heading = "mb-3 font-serif text-lg font-semibold text-amber-900 dark:text-amber-200";
const border = "border-amber-900/15 dark:border-amber-200/15";

export default function ThroneRoom() {
  const router = useRouter();
  const state = useDashboardData(clients);

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (state.status === "error") {
    return <main className="p-8 text-red-700">A raven brings ill news: {state.message}</main>;
  }
  if (state.status !== "ready") {
    return <main className="p-8 text-stone-500">The scribes are tallying…</main>;
  }

  const { data } = state;
  const debts = data.metrics?.debtTrajectory ?? [];
  const budgets = data.metrics?.budgetStatus ?? [];
  const recurring = data.metrics?.recurringCandidates ?? [];
  const runway = data.metrics?.emergencyRunwayMonths;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">🏰 Financial Kingdom</h1>
          <p className="text-sm text-stone-500 dark:text-amber-200/60">
            Rule your realm's treasury.
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

      {/* Same platform events, the Kingdom's voice. */}
      <Section title="Tidings from the realm" headingClassName={heading}>
        {data.events.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-amber-200/60">
            The realm is quiet. Ravens arrive as the royal scribes learn the kingdom's rhythms.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.events.map((e, i) => {
              const t = translate(e);
              return (
                <li
                  key={`${e.type}-${e.occurredOn}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    t.tone === "bad"
                      ? "border-red-800/40 bg-red-100 dark:bg-red-950"
                      : t.tone === "good"
                        ? "border-emerald-800/40 bg-emerald-100 dark:bg-emerald-950"
                        : `${border} bg-white dark:bg-stone-900`
                  }`}
                >
                  {t.headline}
                  <span className="ml-2 text-xs opacity-50">{e.occurredOn}</span>
                </li>
              );
            })}
          </ul>
        )}
        {runway != null && (
          <p className="mt-3 text-sm text-stone-500 dark:text-amber-200/60">
            Siege stores:{" "}
            <span className="font-medium text-stone-800 dark:text-amber-100">{runway} moons</span>
          </p>
        )}
      </Section>

      <Section title="The Royal Ledger" headingClassName={heading}>
        <Table
          borderClassName={border}
          rows={data.accounts.map((a) => [
            a.institution,
            `${a.name}${a.mask ? ` ···${a.mask}` : ""}`,
            a.kind,
            <Amount key={a.id} m={a.balance} />,
          ])}
          empty="No vaults sworn to the crown yet."
        />
      </Section>

      {budgets.length > 0 && (
        <Section title="Royal spending decrees" headingClassName={heading}>
          <ul className="flex flex-col gap-2">
            {budgets.map((b) => (
              <li key={b.category} className="text-sm">
                <div className="flex justify-between">
                  <span>{b.category}</span>
                  <span className="tabular-nums">
                    {fmtMoney(b.spentMtd)} / {fmtMoney(b.monthlyCap)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-amber-900/10 dark:bg-amber-200/10">
                  <div
                    className={`h-2 rounded ${b.overPace ? "bg-red-600" : "bg-amber-600"}`}
                    style={{ width: `${Math.min(100, b.pctOfMonthlyCap)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {debts.length > 0 && (
        <Section title="Debts to the moneylenders" headingClassName={heading}>
          <Table
            borderClassName={border}
            rows={debts.map((d) => [
              `${d.institution} ${d.name}`,
              <Amount key={d.accountId} m={d.currentBalance} />,
              d.delta30d == null ? (
                "—"
              ) : (
                <span
                  key={`${d.accountId}-delta`}
                  className={d.delta30d.amountMinor > 0 ? "text-red-700" : "text-emerald-700"}
                >
                  {d.delta30d.amountMinor > 0 ? "▲" : "▼"} {fmtMoney(d.delta30d)}
                </span>
              ),
            ])}
            empty=""
          />
        </Section>
      )}

      {recurring.length > 0 && (
        <Section title="Standing tithes" headingClassName={heading}>
          <Table
            borderClassName={border}
            rows={recurring.map((r) => [
              r.merchant,
              `~${fmtMoney(r.averageAmount)} each moon`,
              `last paid: ${r.lastSeen}`,
            ])}
            empty=""
          />
        </Section>
      )}

      <Section title="Ledger entries" headingClassName={heading}>
        <Table
          borderClassName={border}
          rows={data.transactions.map((t) => [
            t.postedAt,
            t.merchant ?? t.description,
            t.category,
            <Amount key={t.id} m={t.amount} signed positiveClassName="text-emerald-700" />,
          ])}
          empty="The ledger awaits its first entry."
        />
      </Section>
    </main>
  );
}
