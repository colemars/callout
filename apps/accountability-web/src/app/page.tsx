"use client";

import { Amount, Section, Table, fmtMoney, useDashboardData } from "@platform/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clients, supabase } from "../lib/clients";
import { translate } from "../lib/translate";

const CATEGORIES = [
  "groceries",
  "dining",
  "delivery",
  "coffee",
  "transport",
  "shopping",
  "subscriptions",
  "entertainment",
  "travel",
  "health",
  "housing",
  "debt_payment",
  "income",
  "transfer",
  "other",
] as const;
type CategoryOption = (typeof CATEGORIES)[number];

export default function Dashboard() {
  const router = useRouter();
  const state = useDashboardData(clients);
  // Optimistic category corrections, applied over the fetched rows.
  const [corrected, setCorrected] = useState<Record<string, CategoryOption>>({});

  async function recategorize(id: string, category: CategoryOption) {
    setCorrected((c) => ({ ...c, [id]: category }));
    // Fire-and-forget: the correction is law server-side; a failure simply
    // shows again as the old category on the next load.
    await clients.api
      .PATCH("/api/v1/transactions/{id}", {
        params: { path: { id } },
        body: { category },
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (state.status === "error") {
    return <main className="p-8 text-red-600">Something broke: {state.message}</main>;
  }
  if (state.status !== "ready") {
    return <main className="p-8 text-zinc-500">Loading…</main>;
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
          <h1 className="text-2xl font-bold tracking-tight">Accountability</h1>
          <p className="text-sm text-zinc-500">Your money, told straight.</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          sign out
        </button>
      </header>

      {/* The event feed IS the product: platform events in Accountability's voice. */}
      <Section title="What needs your attention">
        {data.events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing to call out yet. Events appear as the daily sync learns your patterns.
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
                      ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
                      : t.tone === "good"
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  {t.headline}
                  <span className="ml-2 text-xs text-zinc-400">{e.occurredOn}</span>
                </li>
              );
            })}
          </ul>
        )}
        {runway != null && (
          <p className="mt-3 text-sm text-zinc-500">
            Emergency runway:{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{runway} months</span>
          </p>
        )}
      </Section>

      <Section title="Accounts">
        <Table
          rows={data.accounts.map((a) => [
            <div key={a.id} className="whitespace-normal">
              <div>
                {a.name}
                {a.mask ? ` ···${a.mask}` : ""}
              </div>
              <div className="text-xs text-zinc-500">
                {a.institution} · {a.kind}
              </div>
            </div>,
            <Amount key={`${a.id}-balance`} m={a.balance} />,
          ])}
          empty="No accounts yet — link a bank first."
        />
      </Section>

      {budgets.length > 0 && (
        <Section title="Budgets (month to date)">
          <ul className="flex flex-col gap-2">
            {budgets.map((b) => (
              <li key={b.category} className="text-sm">
                <div className="flex justify-between">
                  <span>{b.category}</span>
                  <span className="tabular-nums">
                    {fmtMoney(b.spentMtd)} / {fmtMoney(b.monthlyCap)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-2 rounded ${b.overPace ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, b.pctOfMonthlyCap)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {debts.length > 0 && (
        <Section title="Debt (30-day change)">
          <Table
            rows={debts.map((d) => [
              `${d.institution} ${d.name}`,
              <Amount key={d.accountId} m={d.currentBalance} />,
              d.delta30d == null ? (
                "—"
              ) : (
                <span
                  key={`${d.accountId}-delta`}
                  className={d.delta30d.amountMinor > 0 ? "text-red-600" : "text-emerald-600"}
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
        <Section title="Subscriptions & recurring">
          <Table
            rows={recurring.map((r) => [
              r.merchant,
              `~${fmtMoney(r.averageAmount)} every ${Math.round(r.averageGapDays)}d`,
              `last: ${r.lastSeen}`,
            ])}
            empty=""
          />
        </Section>
      )}

      <Section title="Recent transactions">
        <Table
          rows={data.transactions.map((t) => {
            const category = corrected[t.id] ?? t.category;
            const isUser = corrected[t.id] !== undefined || t.categorySource === "user";
            return [
              <span key={t.id} className="text-zinc-500">
                {t.postedAt.slice(5)}
              </span>,
              <div key={`${t.id}-what`} className="whitespace-normal">
                <div>{t.merchant ?? t.description}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  <select
                    value={category}
                    onChange={(e) => recategorize(t.id, e.target.value as CategoryOption)}
                    className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
                    aria-label="Category"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {isUser && <span title="Corrected by you — survives every sync">✎</span>}
                  {t.categorySource === "ai" && !isUser && (
                    <span title="Categorized by the scribes (AI)">✦</span>
                  )}
                </div>
              </div>,
              <Amount key={`${t.id}-amt`} m={t.amount} signed />,
            ];
          })}
          empty="No transactions yet."
        />
      </Section>
    </main>
  );
}
