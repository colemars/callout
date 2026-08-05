"use client";

// Royal Decrees — the crown's own laws: monthly spending caps (watchtowers
// watch them) and sworn undertakings (goals the engine paces). Everything here
// writes through the platform API; the kingdom only ever renders what is law.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clients, supabase } from "../../lib/clients";

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
] as const;
type DecreeCategory = (typeof CATEGORIES)[number];

interface BudgetView {
  category: string;
  monthlyCap: { amountMinor: number; currency: string };
  active: boolean;
}

interface GoalView {
  id: string;
  kind: "savings_net_flow" | "balance_target" | "debt_paydown";
  accountId?: string;
  targetAmount: { amountMinor: number; currency: string };
  targetDate?: string;
  active: boolean;
}

interface AccountView {
  id: string;
  name: string;
  institution: string;
  kind: string;
  balance: { amountMinor: number; currency: string };
}

const fmtUsd = (minor: number): string =>
  (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const GOAL_KIND_COPY: Record<GoalView["kind"], string> = {
  savings_net_flow: "amass treasure (net savings)",
  balance_target: "grow a vault to a mark",
  debt_paydown: "drive the raiders down to a mark",
};

const input =
  "rounded-lg border border-amber-800/30 bg-white px-2 py-1 text-sm dark:border-amber-200/20 dark:bg-stone-900";
const button =
  "rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-700 disabled:opacity-50";
const muted = "text-stone-500 dark:text-amber-200/60";

export default function RoyalDecrees() {
  const router = useRouter();
  const [budgets, setBudgets] = useState<BudgetView[] | null>(null);
  const [goals, setGoals] = useState<GoalView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [message, setMessage] = useState("");

  // New-decree form state.
  const [decreeCategory, setDecreeCategory] = useState<DecreeCategory>("dining");
  const [decreeCap, setDecreeCap] = useState("");
  // New-undertaking form state.
  const [goalKind, setGoalKind] = useState<GoalView["kind"]>("savings_net_flow");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [goalAccount, setGoalAccount] = useState("");

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    if (session.session === null) {
      router.replace("/login");
      return;
    }
    const [b, g, a] = await Promise.all([
      clients.api.GET("/api/v1/budgets"),
      clients.api.GET("/api/v1/goals"),
      clients.api.GET("/api/v1/accounts"),
    ]);
    setBudgets((b.data ?? []) as BudgetView[]);
    setGoals((g.data ?? []) as GoalView[]);
    setAccounts((a.data ?? []) as AccountView[]);
  }, [router]);

  useEffect(() => {
    load().catch((e) => setMessage(String(e)));
  }, [load]);

  async function issueDecree() {
    const capMinor = Math.round(Number.parseFloat(decreeCap) * 100);
    if (!Number.isFinite(capMinor) || capMinor <= 0) {
      setMessage("A decree needs a sum greater than zero.");
      return;
    }
    setMessage("");
    const { error } = await clients.api.PUT("/api/v1/budgets/{category}", {
      params: { path: { category: decreeCategory } },
      body: { monthlyCapMinor: capMinor },
    });
    if (error) {
      setMessage(`The decree was refused: ${JSON.stringify(error)}`);
      return;
    }
    setDecreeCap("");
    setMessage("The decree is sealed. The watchtowers take their posts.");
    load();
  }

  async function repeal(category: string) {
    await clients.api.DELETE("/api/v1/budgets/{category}", {
      params: { path: { category: category as DecreeCategory } },
    });
    setMessage("The decree is repealed.");
    load();
  }

  async function swearUndertaking() {
    const targetMinor = Math.round(Number.parseFloat(goalTarget) * 100);
    if (!Number.isFinite(targetMinor) || targetMinor < 100_00) {
      setMessage("An undertaking worth swearing starts at $100.");
      return;
    }
    const needsAccount = goalKind !== "savings_net_flow";
    if (needsAccount && goalAccount === "") {
      setMessage("Choose the vault this undertaking concerns.");
      return;
    }
    setMessage("");
    const { error } = await clients.api.POST("/api/v1/goals", {
      body: {
        kind: goalKind,
        targetAmountMinor: targetMinor,
        ...(goalDate === "" ? {} : { targetDate: goalDate }),
        ...(needsAccount ? { accountId: goalAccount } : {}),
      },
    });
    if (error) {
      setMessage(`The oath was refused: ${JSON.stringify(error)}`);
      return;
    }
    setGoalTarget("");
    setGoalDate("");
    setMessage("The undertaking is sworn. The engine will pace it honestly.");
    load();
  }

  async function renounce(id: string) {
    await clients.api.PATCH("/api/v1/goals/{id}", {
      params: { path: { id } },
      body: { active: false },
    });
    setMessage("The undertaking is renounced — without penalty.");
    load();
  }

  const accountLabel = (id?: string) => {
    const a = accounts.find((x) => x.id === id);
    return a === undefined ? "" : ` — ${a.institution} ${a.name}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header>
        <h1 className="font-serif text-2xl font-bold tracking-tight">📜 Royal Decrees</h1>
        <p className={`text-sm ${muted}`}>
          The crown's laws: what the court may spend, and what it has sworn to achieve.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/" className={`underline hover:text-amber-800 ${muted}`}>
            ← the throne room
          </Link>
        </p>
      </header>

      <section className="mt-6">
        <h2 className="font-serif text-lg font-semibold text-amber-900 dark:text-amber-200">
          Spending decrees
        </h2>
        <p className={`text-xs ${muted}`}>
          "The court shall spend no more than the stated sum each month." The watchtowers keep
          watch; breaching a decree brings warnings, never punishment.
        </p>
        {budgets === null ? (
          <p className={`mt-2 text-sm ${muted}`}>The scribes are fetching the law…</p>
        ) : budgets.length === 0 ? (
          <p className={`mt-2 text-sm ${muted}`}>No decrees issued — the court spends unwatched.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {budgets.map((b) => (
              <li key={b.category} className="flex items-baseline justify-between gap-4 text-sm">
                <span>
                  {b.category} — no more than{" "}
                  <span className="tabular-nums">{fmtUsd(b.monthlyCap.amountMinor)}</span> each
                  month
                </span>
                <button
                  type="button"
                  onClick={() => repeal(b.category)}
                  className={`shrink-0 underline ${muted}`}
                >
                  repeal
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={decreeCategory}
            onChange={(e) => setDecreeCategory(e.target.value as DecreeCategory)}
            className={input}
            aria-label="Category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="$ per month"
            value={decreeCap}
            onChange={(e) => setDecreeCap(e.target.value)}
            className={`${input} w-32`}
            aria-label="Monthly cap in dollars"
          />
          <button type="button" onClick={issueDecree} className={button}>
            Issue decree
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-lg font-semibold text-amber-900 dark:text-amber-200">
          Sworn undertakings
        </h2>
        <p className={`text-xs ${muted}`}>
          Goals the royal surveyors pace from real ledgers. Renouncing one carries no penalty.
        </p>
        {goals === null ? (
          <p className={`mt-2 text-sm ${muted}`}>The scribes are fetching the oaths…</p>
        ) : goals.length === 0 ? (
          <p className={`mt-2 text-sm ${muted}`}>Nothing sworn yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {goals.map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span>
                  {GOAL_KIND_COPY[g.kind]}: {fmtUsd(g.targetAmount.amountMinor)}
                  {g.targetDate ? ` by ${g.targetDate}` : ""}
                  {accountLabel(g.accountId)}
                </span>
                <button
                  type="button"
                  onClick={() => renounce(g.id)}
                  className={`shrink-0 underline ${muted}`}
                >
                  renounce
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={goalKind}
            onChange={(e) => setGoalKind(e.target.value as GoalView["kind"])}
            className={input}
            aria-label="Undertaking kind"
          >
            {(Object.keys(GOAL_KIND_COPY) as GoalView["kind"][]).map((k) => (
              <option key={k} value={k}>
                {GOAL_KIND_COPY[k]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="100"
            step="1"
            placeholder="$ target"
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            className={`${input} w-28`}
            aria-label="Target in dollars"
          />
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className={input}
            aria-label="Target date"
          />
          {goalKind !== "savings_net_flow" && (
            <select
              value={goalAccount}
              onChange={(e) => setGoalAccount(e.target.value)}
              className={input}
              aria-label="Account"
            >
              <option value="">choose a vault…</option>
              {accounts
                .filter((a) =>
                  goalKind === "debt_paydown" ? a.kind === "credit" || a.kind === "loan" : true,
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} {a.name} ({fmtUsd(a.balance.amountMinor)})
                  </option>
                ))}
            </select>
          )}
          <button type="button" onClick={swearUndertaking} className={button}>
            Swear it
          </button>
        </div>
      </section>

      {message !== "" && (
        <p className="mt-6 text-sm" aria-live="polite">
          {message}
        </p>
      )}
    </main>
  );
}
