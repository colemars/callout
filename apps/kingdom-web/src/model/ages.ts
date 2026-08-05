import {
  classifyAccount,
  fmtMinor,
  incomeEstimate,
  recurringLoad,
  referenceMonths,
  sumBalances,
} from "./derive";
import type { AgeGate, AgeState, KingdomInput } from "./types";

/**
 * Ages advance on financial maturity, cumulatively: the realm holds the
 * highest age whose every gate (and every earlier gate) passes.
 * Missing-data policy: "prove the good thing" gates fail provisionally;
 * "no evidence of harm" gates pass provisionally. No fake alarms, but
 * advancement must be earned with evidence.
 */
const AGES = [
  {
    id: 1,
    name: "Survive the Winter",
    icon: "🏕️",
    tagline: "A village behind a wooden palisade. Can the people outlast the cold?",
  },
  {
    id: 2,
    name: "Fortify",
    icon: "🏰",
    tagline: "Stone walls rise. The realm grows difficult to kill.",
  },
  {
    id: 3,
    name: "Expand",
    icon: "🌾",
    tagline: "Every coin has a job. Farms, caravans, and workshops produce while the court sleeps.",
  },
  {
    id: 4,
    name: "Prosperity",
    icon: "👑",
    tagline: "The kingdom runs itself. Storms come — it barely notices.",
  },
] as const;

export function computeAge(input: KingdomInput): AgeState {
  const { ref, provisional } = referenceMonths(input.metrics);
  const runway = input.metrics?.emergencyRunwayMonths ?? null;
  const flow = ref?.netCashFlow.amountMinor ?? null;
  const income = incomeEstimate(ref);
  const highInterest = input.metrics?.totalHighInterestDebt?.amountMinor ?? 0;
  const tithes = recurringLoad(input.metrics);
  const goldMinor = sumBalances(input.accounts, "liquid");
  const stoneMinor =
    sumBalances(input.accounts, "retirement") + sumBalances(input.accounts, "brokerage");
  const retirementAccounts = input.accounts.filter((a) => classifyAccount(a) === "retirement");
  const savingsRate = flow !== null && income !== null ? flow / income : null;

  const gate = (
    id: string,
    label: string,
    themedLabel: string,
    passed: boolean,
    evidence: string,
    isProvisional = false,
  ): AgeGate => ({ id, label, themedLabel, passed, provisional: isProvisional, evidence });

  const toAge2: AgeGate[] = [
    gate(
      "runway3",
      "Emergency fund covers 3 months",
      "Fill the granary for one winter",
      runway !== null && runway >= 3,
      runway === null ? "runway unmeasured" : `runway = ${runway} months`,
      runway === null,
    ),
    gate(
      "positiveFlow",
      "Positive monthly cash flow",
      "More tribute arrives than leaves",
      flow !== null && flow > 0 && !provisional,
      flow === null
        ? "the first full month has not closed"
        : `net cash flow ${fmtMinor(flow)}${provisional ? " (month still open)" : ""}`,
      flow === null || provisional,
    ),
    gate(
      "banditsContained",
      "High-interest debt not growing",
      "The bandits gain no ground",
      highInterest === 0 ||
        (input.metrics?.debtTrajectory ?? []).every(
          (d) => d.delta30d === null || d.delta30d.amountMinor <= 0,
        ),
      highInterest === 0
        ? "no high-interest debt"
        : `credit balances ${fmtMinor(highInterest)}; 30-day trend ${
            (input.metrics?.debtTrajectory ?? []).some((d) => d.delta30d !== null)
              ? "recorded"
              : "not yet recorded"
          }`,
      highInterest > 0 && (input.metrics?.debtTrajectory ?? []).every((d) => d.delta30d === null),
    ),
    gate(
      "obligationsLight",
      "Recurring obligations ≤ 25% of income",
      "The standing tithes rest light on the realm",
      income === null || tithes === 0 || tithes / income <= 0.25,
      tithes === 0
        ? "no standing tithes recorded yet"
        : income === null
          ? `tithes ${fmtMinor(tithes)}/mo; income unmeasured`
          : `tithes ${fmtMinor(tithes)}/mo = ${((tithes / income) * 100).toFixed(0)}% of income`,
      income === null || tithes === 0,
    ),
  ];

  const toAge3: AgeGate[] = [
    gate(
      "banditsGone",
      "High-interest debt eliminated",
      "Drive the bandits from the realm",
      highInterest === 0,
      highInterest === 0
        ? "no high-interest debt"
        : `${fmtMinor(highInterest)} still held by raiders`,
    ),
    gate(
      "treasuryFounded",
      "Retirement investing underway",
      "Found the Royal Treasury",
      retirementAccounts.some((a) => a.balance.amountMinor > 0),
      retirementAccounts.length === 0
        ? "no retirement vaults sworn to the crown"
        : `${retirementAccounts.length} vault(s), ${fmtMinor(
            retirementAccounts.reduce((s, a) => s + a.balance.amountMinor, 0),
          )} sealed`,
    ),
    gate(
      "runway6",
      "Emergency fund covers 6 months",
      "Grain enough for the longest siege",
      runway !== null && runway >= 6,
      runway === null ? "runway unmeasured" : `runway = ${runway} months`,
      runway === null,
    ),
    gate(
      "savings10",
      "Savings rate ≥ 10%",
      "One coin in ten builds the realm",
      savingsRate !== null && savingsRate >= 0.1 && !provisional,
      savingsRate === null
        ? "savings rate unmeasured (needs a full month)"
        : `savings rate ${(savingsRate * 100).toFixed(0)}%`,
      savingsRate === null || provisional,
    ),
  ];

  // Essential monthly recovered from the engine's own runway math: liquid ÷ runway.
  const essentialMonthly = runway !== null && runway > 0 ? goldMinor / runway : null;
  const fiTarget = essentialMonthly === null ? null : essentialMonthly * 300; // 25y × 12 (4% rule proxy)
  // Real passive income (Plaid Investments dividends/interest) beats the proxy when present.
  const passiveMonthly = input.metrics?.investments?.passiveIncomeMonthly?.amountMinor ?? null;
  const passiveCovers =
    passiveMonthly !== null && essentialMonthly !== null && passiveMonthly >= essentialMonthly;
  const toAge4: AgeGate[] = [
    gate(
      "selfSustaining",
      "Passive income covers essential spending (or 4%-rule holdings)",
      "The fields feed the realm without the crown lifting a finger",
      passiveCovers || (fiTarget !== null && goldMinor + stoneMinor >= fiTarget),
      passiveCovers
        ? `passive income ${fmtMinor(passiveMonthly ?? 0)}/mo covers essentials ${fmtMinor(essentialMonthly ?? 0)}/mo (measured from dividends)`
        : fiTarget === null
          ? "essential spend unmeasured"
          : `holdings ${fmtMinor(goldMinor + stoneMinor)} of ${fmtMinor(fiTarget)} needed (4%-rule proxy${passiveMonthly === null ? "; passive income unmeasured" : ""})`,
      fiTarget === null && !passiveCovers,
    ),
    gate(
      "savings30",
      "Savings rate ≥ 30%",
      "The realm stores three coins in ten",
      savingsRate !== null && savingsRate >= 0.3 && !provisional,
      savingsRate === null
        ? "savings rate unmeasured"
        : `savings rate ${(savingsRate * 100).toFixed(0)}%`,
      savingsRate === null || provisional,
    ),
  ];

  const ladders = [toAge2, toAge3, toAge4];
  let current: 1 | 2 | 3 | 4 = 1;
  for (const ladder of ladders) {
    if (ladder.every((g) => g.passed)) current = (current + 1) as 2 | 3 | 4;
    else break;
  }

  const definition = AGES[current - 1];
  const gatesToNext = current === 4 ? null : (ladders[current - 1] ?? null);
  return {
    current,
    name: definition?.name ?? "Survive the Winter",
    icon: definition?.icon ?? "🏕️",
    tagline: definition?.tagline ?? "",
    gatesToNext,
    provisional,
  };
}
