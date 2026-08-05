import { classifyAccount, fmtMinor, lifestyleShare, referenceMonths, sumBalances } from "./derive";
import { ASSUMED_CARD_APR_PCT, banditToll } from "./threats";
import type {
  AgeState,
  KingdomInput,
  MoatState,
  ResourceState,
  StructureLine,
  StructureState,
} from "./types";

type Level = StructureState["level"];
const asLevel = (n: number): Level => Math.max(0, Math.min(5, Math.round(n))) as Level;

const stoneTier = (minor: number): Level =>
  minor <= 0
    ? 0
    : minor < 10_000_00
      ? 1
      : minor < 50_000_00
        ? 2
        : minor < 250_000_00
          ? 3
          : minor < 1_000_000_00
            ? 4
            : 5;

export function computeStructures(
  input: KingdomInput,
  age: AgeState,
  resources: ResourceState[],
  moat: MoatState,
): StructureState[] {
  const { ref } = referenceMonths(input.metrics);
  const resource = (key: string) => resources.find((r) => r.key === key);
  const retirementMinor = sumBalances(input.accounts, "retirement");
  const brokerageMinor = sumBalances(input.accounts, "brokerage");
  const mortgageMinor = sumBalances(input.accounts, "mortgage");
  const studentMinor = sumBalances(input.accounts, "student");
  const highInterest = input.metrics?.totalHighInterestDebt?.amountMinor ?? 0;
  const budgets = input.metrics?.budgetStatus ?? [];
  const share = lifestyleShare(ref);

  const accountLines = (
    cls: "retirement" | "brokerage" | "mortgage" | "student",
  ): StructureLine[] =>
    input.accounts
      .filter((a) => classifyAccount(a) === cls && a.balance.amountMinor !== 0)
      .sort((a, b) => b.balance.amountMinor - a.balance.amountMinor)
      .map((a) => {
        const parts = [
          a.apr === undefined ? null : `${a.apr}%${a.aprType === "fixed" ? " fixed" : ""}`,
          a.minPayment === undefined ? null : `${fmtMinor(a.minPayment.amountMinor)}/month`,
        ].filter((x) => x !== null);
        return {
          label: `${a.institution} ${a.name}`,
          value: fmtMinor(a.balance.amountMinor),
          ...(parts.length > 0 ? { note: parts.join(" · ") } : {}),
        };
      });

  const structures: StructureState[] = [
    {
      key: "keep",
      name: "The Keep",
      icon: "🏰",
      exists: true,
      value: age.current,
      unit: "count" as const,
      level: asLevel(age.current + 1),
      detail: `Age ${age.current} — ${age.name}`,
    },
    {
      key: "granary",
      name: "The Granary",
      icon: "🌾",
      exists: true,
      value: input.metrics?.emergencyRunwayMonths ?? null,
      unit: "months" as const,
      level: resource("grain")?.level ?? 0,
      detail: resource("grain")?.displayValue ?? "unmeasured",
      ...(() => {
        const runway = input.metrics?.emergencyRunwayMonths ?? null;
        const liquid = sumBalances(input.accounts, "liquid");
        if (runway === null || runway <= 0) return {};
        return {
          lines: [
            { label: "liquid stores", value: fmtMinor(liquid) },
            {
              label: "the realm's essential needs",
              value: `≈ ${fmtMinor(Math.round(liquid / runway))}/month`,
            },
          ] satisfies StructureLine[],
          basis: "runway = liquid balances ÷ trailing average essential spend",
        };
      })(),
    },
    {
      key: "walls",
      name: "The Walls & Moat",
      icon: "🧱",
      exists: true,
      value: moat.score,
      unit: "score" as const,
      level: { dry: 1, narrow: 2, broad: 4, vast: 5 }[moat.tier] as Level,
      detail: `${moat.tierLabel} (${moat.score}/100)`,
    },
  ];

  if (retirementMinor > 0) {
    structures.push({
      key: "treasury",
      name: "The Royal Treasury",
      icon: "🏛️",
      exists: true,
      locked: true,
      value: retirementMinor,
      unit: "minor" as const,
      level: stoneTier(retirementMinor),
      detail: `${fmtMinor(retirementMinor)} · sealed until old age`,
      lines: accountLines("retirement"),
      basis: "retirement-subtype account balances, as the banks report them",
    });
  }
  if (brokerageMinor > 0) {
    structures.push({
      key: "caravans",
      name: "Merchant Caravans",
      icon: "🐪",
      exists: true,
      value: brokerageMinor,
      unit: "minor" as const,
      level: stoneTier(brokerageMinor),
      detail: `${fmtMinor(brokerageMinor)} riding the trade winds`,
      lines: accountLines("brokerage"),
      basis: "investment account balances, as the banks report them",
    });
  }

  structures.push({
    key: "market",
    name: "The Market Square",
    icon: "⚖️",
    exists: true,
    value: resource("builders")?.value ?? null,
    unit: "minor" as const,
    level: resource("builders")?.level ?? 0,
    detail: resource("builders")?.displayValue ?? "quiet",
  });

  structures.push({
    key: "festival",
    name: "The Festival Grounds",
    icon: "🎪",
    exists: true,
    value: share,
    unit: "ratio" as const,
    level: resource("happiness")?.level ?? 3,
    detail:
      share === null ? "awaiting the first festival" : (resource("happiness")?.displayValue ?? ""),
  });

  if (mortgageMinor > 0) {
    structures.push({
      key: "manor",
      name: "The Manor",
      icon: "🏡",
      exists: true,
      lien: true,
      value: mortgageMinor,
      unit: "minor" as const,
      level: 2,
      detail: `pledged to the bank — ${fmtMinor(mortgageMinor)} remains`,
      lines: accountLines("mortgage"),
      basis: "mortgage balances (and rates where the bank reports them)",
    });
  }
  if (studentMinor > 0) {
    structures.push({
      key: "guildDebt",
      name: "Guild of Scholars' Debt",
      icon: "📜",
      exists: true,
      value: studentMinor,
      unit: "minor" as const,
      level: 0,
      detail: `${fmtMinor(studentMinor)} owed for the crown's education`,
      lines: accountLines("student"),
      basis: "student-loan balances (and rates where the bank reports them)",
    });
  }
  const activeGoals = (input.goals ?? []).filter((g) => g.active);
  if (budgets.length > 0 || activeGoals.length > 0) {
    // Two distinct signals for decrees: an ALARM (spending outpaces the month
    // — early warning) and a BREACH (the monthly cap itself is spent).
    const isBreached = (b: (typeof budgets)[number]) =>
      b.spentMtd.amountMinor > b.monthlyCap.amountMinor;
    const breached = budgets.filter(isBreached).length;
    const alarms = budgets.filter((b) => b.overPace && !isBreached(b)).length;

    const statuses = new Map((input.metrics?.goalStatuses ?? []).map((st) => [st.goalId, st]));
    const straying = activeGoals.filter((g) => statuses.get(g.id)?.onTrack === false).length;
    const kindCopy: Record<string, string> = {
      savings_net_flow: "amass treasure",
      balance_target: "grow the vault",
      debt_paydown: "drive the raiders down",
    };

    const summary = [
      budgets.length > 0
        ? `${budgets.length} decree${budgets.length === 1 ? "" : "s"} watched`
        : null,
      activeGoals.length > 0
        ? `${activeGoals.length} oath${activeGoals.length === 1 ? "" : "s"} sworn`
        : null,
      breached > 0 ? `${breached} breached` : null,
      alarms > 0 ? `${alarms} alarm${alarms === 1 ? "" : "s"}` : null,
      straying > 0 ? `${straying} straying` : null,
    ]
      .filter((x) => x !== null)
      .join(" · ");

    const decreeLines: StructureLine[] = budgets.map((b): StructureLine => {
      const spent = b.spentMtd.amountMinor;
      const cap = b.monthlyCap.amountMinor;
      const pace = b.proratedCap.amountMinor;
      if (isBreached(b)) {
        return {
          label: b.category,
          value: `${fmtMinor(spent)} of ${fmtMinor(cap)}`,
          note: "✗ breached — the monthly cap is spent",
          tone: "bad",
        };
      }
      if (b.overPace) {
        return {
          label: b.category,
          value: `${fmtMinor(spent)} of ${fmtMinor(cap)}`,
          note: `⚠ alarm — ${Math.round((spent / cap) * 100)}% spent; even pace would be ${fmtMinor(pace)} by today`,
          tone: "warn",
        };
      }
      return {
        label: b.category,
        value: `${fmtMinor(spent)} of ${fmtMinor(cap)}`,
        note: "on pace",
        tone: "good",
      };
    });

    const oathLines: StructureLine[] = activeGoals.map((g): StructureLine => {
      const account = input.accounts.find((a) => a.id === g.accountId);
      const st = statuses.get(g.id);
      const what = `${kindCopy[g.kind] ?? g.kind} to ${fmtMinor(g.targetAmount.amountMinor)}${
        g.targetDate === undefined ? "" : ` by ${g.targetDate}`
      }${account === undefined ? "" : ` — ${account.institution} ${account.name}`}`;
      if (st === undefined || !st.evaluable || st.onTrack === null) {
        return { label: what, note: "not yet paceable" } satisfies StructureLine;
      }
      const actual = st.actual === null ? "" : fmtMinor(st.actual.amountMinor);
      const expected = st.expected === null ? "" : fmtMinor(st.expected.amountMinor);
      return {
        label: what,
        value: actual,
        note: st.onTrack
          ? `on pace — ${expected} expected by today`
          : `straying — ${expected} expected by today`,
        tone: st.onTrack ? ("good" as const) : ("bad" as const),
      };
    });

    structures.push({
      key: "watchtowers",
      name: "The Watchtowers",
      icon: "🗼",
      exists: true,
      value: budgets.length + activeGoals.length,
      unit: "count" as const,
      // Status-led pips: quiet towers glow; alarms and straying dim them;
      // a breach darkens the sky.
      level: asLevel(breached > 0 ? 1 : alarms + straying > 0 ? 3 : 5),
      detail: summary === "" ? "the towers stand quiet" : summary,
      lines: [
        ...(decreeLines.length > 0
          ? [{ label: "spending decrees", heading: true } satisfies StructureLine, ...decreeLines]
          : []),
        ...(oathLines.length > 0
          ? [{ label: "sworn undertakings", heading: true } satisfies StructureLine, ...oathLines]
          : []),
      ],
      basis:
        "decrees: month-to-date spending vs your caps ('alarm' = ahead of even pace, 'breach' = cap spent). oaths: paced linearly from baseline to target date",
    });
  }

  if (highInterest > 0) {
    structures.push({
      key: "banditCamp",
      name: "The Bandit Camp",
      icon: "⛺",
      exists: true,
      hostile: true,
      value: highInterest,
      unit: "minor" as const,
      // Full 0-5 range — the camp grows with the debt: <$1k, <$5k, <$15k,
      // <$40k, then a fortress. (The old ladder capped at 3, sandbox-tuned.)
      level: asLevel(
        highInterest < 1_000_00
          ? 1
          : highInterest < 5_000_00
            ? 2
            : highInterest < 15_000_00
              ? 3
              : highInterest < 40_000_00
                ? 4
                : 5,
      ),
      detail: (() => {
        const { tollMinor } = banditToll(input.accounts);
        return tollMinor > 0
          ? `${fmtMinor(highInterest)} claimed by raiders · ≈ ${fmtMinor(tollMinor)}/month toll`
          : `${fmtMinor(highInterest)} claimed by raiders`;
      })(),
      lines: input.accounts
        .filter((a) => classifyAccount(a) === "credit" && a.balance.amountMinor > 0)
        .sort((a, b) => b.balance.amountMinor - a.balance.amountMinor)
        .map((a): StructureLine => {
          const apr = a.apr ?? ASSUMED_CARD_APR_PCT;
          const label = a.apr === undefined ? "assumed " : "";
          const toll = Math.round((a.balance.amountMinor * apr) / 100 / 12);
          return {
            label: `${a.institution} ${a.name}`,
            value: fmtMinor(a.balance.amountMinor),
            note: `${label}${apr}% ≈ ${fmtMinor(toll)}/month in interest`,
          };
        }),
      basis: "credit balances; tolls from bank-reported APRs (assumed 24% where unreported)",
    });
  }

  return structures;
}
