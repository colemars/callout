import { classifyAccount, fmtMinor, lifestyleShare, referenceMonths, sumBalances } from "./derive";
import { ASSUMED_CARD_APR_PCT, banditToll } from "./threats";
import type { AgeState, KingdomInput, MoatState, ResourceState, StructureState } from "./types";

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

  const accountLines = (cls: "retirement" | "brokerage" | "mortgage" | "student") =>
    input.accounts
      .filter((a) => classifyAccount(a) === cls && a.balance.amountMinor !== 0)
      .sort((a, b) => b.balance.amountMinor - a.balance.amountMinor)
      .map((a) => {
        const rate =
          a.apr === undefined ? "" : ` · ${a.apr}%${a.aprType === "fixed" ? " fixed" : ""}`;
        const payment =
          a.minPayment === undefined ? "" : ` · ${fmtMinor(a.minPayment.amountMinor)}/month`;
        return `${a.institution} ${a.name}: ${fmtMinor(a.balance.amountMinor)}${rate}${payment}`;
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
            `liquid stores: ${fmtMinor(liquid)}`,
            `the realm's essential needs: ≈ ${fmtMinor(Math.round(liquid / runway))}/month`,
          ],
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
  if (budgets.length > 0) {
    // Two distinct signals: an ALARM (spending outpaces the month — early
    // warning) and a BREACH (the monthly cap itself is spent — the law broken).
    const isBreached = (b: (typeof budgets)[number]) =>
      b.spentMtd.amountMinor > b.monthlyCap.amountMinor;
    const breached = budgets.filter(isBreached).length;
    const alarms = budgets.filter((b) => b.overPace && !isBreached(b)).length;
    const summary = [
      breached > 0 ? `${breached} breached` : null,
      alarms > 0 ? `${alarms} alarm${alarms === 1 ? "" : "s"} sounding` : null,
    ]
      .filter((x) => x !== null)
      .join(" · ");
    structures.push({
      key: "watchtowers",
      name: "The Watchtowers",
      icon: "🗼",
      exists: true,
      value: budgets.length,
      unit: "count" as const,
      level: asLevel(Math.min(budgets.length, 5)),
      detail: `${budgets.length} decree${budgets.length === 1 ? "" : "s"} watched · ${
        summary === "" ? "all quiet" : summary
      }`,
      basis:
        "month-to-date spending vs your decreed caps; 'alarm' compares to even daily pace, 'breach' to the full cap",
      lines: budgets.map((b) => {
        const spent = b.spentMtd.amountMinor;
        const cap = b.monthlyCap.amountMinor;
        const pace = b.proratedCap.amountMinor;
        const state = isBreached(b)
          ? "✗ breached — the cap is spent"
          : b.overPace
            ? `⚠ alarm — ahead of pace (${fmtMinor(pace)} would be even spending by today)`
            : "on pace";
        return `${b.category}: ${fmtMinor(spent)} of ${fmtMinor(cap)} (${Math.round((spent / cap) * 100)}%) · ${state}`;
      }),
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
        .map((a) => {
          const apr = a.apr ?? ASSUMED_CARD_APR_PCT;
          const label = a.apr === undefined ? "assumed " : "";
          const toll = Math.round((a.balance.amountMinor * apr) / 100 / 12);
          return `${a.institution} ${a.name}: ${fmtMinor(a.balance.amountMinor)} at ${label}${apr}% ≈ ${fmtMinor(toll)}/month`;
        }),
      basis: "credit balances; tolls from bank-reported APRs (assumed 24% where unreported)",
    });
  }

  return structures;
}
