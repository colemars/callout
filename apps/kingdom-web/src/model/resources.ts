import { fmtMinor, incomeEstimate, lifestyleShare, referenceMonths, sumBalances } from "./derive";
import type { KingdomInput, ResourceState } from "./types";

type Level = ResourceState["level"];

function tier(value: number, bounds: readonly number[]): Level {
  let level = 0;
  for (const bound of bounds) {
    if (value >= bound) level++;
  }
  return Math.min(level, 5) as Level;
}

export function computeResources(input: KingdomInput): ResourceState[] {
  const { ref, provisional } = referenceMonths(input.metrics);
  const spend = ref?.totalSpending.amountMinor ?? null;

  // GOLD — liquidity.
  const goldMinor = sumBalances(input.accounts, "liquid");
  const goldMonths = spend !== null && spend > 0 ? goldMinor / spend : null;
  const gold: ResourceState = {
    key: "gold",
    themeName: "Gold",
    icon: "🪙",
    value: goldMinor,
    max: 50_000_00,
    unit: "minor",
    level:
      goldMonths !== null
        ? tier(goldMonths, [0.25, 0.5, 1, 3, 6])
        : tier(goldMinor, [100_00, 500_00, 2_000_00, 10_000_00, 50_000_00]),
    displayValue: fmtMinor(goldMinor),
    basis:
      goldMonths !== null
        ? `liquid balances ÷ monthly spend = ${goldMonths.toFixed(1)} months of gold`
        : "liquid account balances (no full month of spending yet)",
    provisional: goldMonths === null || provisional,
  };

  // GRAIN — emergency runway, verbatim from the engine.
  const runway = input.metrics?.emergencyRunwayMonths ?? null;
  const grain: ResourceState = {
    key: "grain",
    themeName: "Grain",
    icon: "🌾",
    value: runway,
    max: 24,
    unit: "months",
    level: runway === null ? 0 : tier(runway, [1, 3, 6, 12, 24]),
    displayValue: runway === null ? "unmeasured" : `${runway} months of grain`,
    basis: "emergency runway (liquid ÷ average essential spend, from the royal surveyors)",
    provisional: runway === null,
  };

  // STONE — long-term assets.
  const retirementMinor = sumBalances(input.accounts, "retirement");
  const brokerageMinor = sumBalances(input.accounts, "brokerage");
  const stoneMinor = retirementMinor + brokerageMinor;
  const stone: ResourceState = {
    key: "stone",
    themeName: "Stone",
    icon: "🪨",
    value: stoneMinor,
    max: 1_000_000_00,
    unit: "minor",
    level: tier(stoneMinor, [1, 10_000_00, 50_000_00, 250_000_00, 1_000_000_00]),
    displayValue: fmtMinor(stoneMinor),
    basis: `retirement ${fmtMinor(retirementMinor)} + caravans ${fmtMinor(brokerageMinor)} (home equity not yet surveyed)`,
    provisional: false,
  };

  // BUILDERS — free cash flow.
  const flow = ref?.netCashFlow.amountMinor ?? null;
  const income = incomeEstimate(ref);
  const savingsRate = flow !== null && income !== null ? flow / income : null;
  const builders = flow === null ? 0 : Math.max(-10, Math.min(10, Math.trunc(flow / 50_000)));
  const buildersLevel: Level =
    flow === null || flow <= 0
      ? 0
      : savingsRate === null
        ? 1
        : tier(savingsRate, [0.0001, 0.05, 0.1, 0.2, 0.3]);
  const buildersState: ResourceState = {
    key: "builders",
    themeName: "Builders",
    icon: "🔨",
    value: flow,
    max: null,
    unit: "minor",
    level: buildersLevel,
    displayValue:
      flow === null
        ? "the first month has not closed"
        : `${flow >= 0 ? "+" : "−"}${fmtMinor(Math.abs(flow))} ${provisional ? "this month (so far)" : "last month"} · ${
            builders > 0
              ? `${builders} builder${builders === 1 ? " arrives" : "s arrive"}`
              : builders < 0
                ? `${-builders} worker${builders === -1 ? " departs" : "s depart"}`
                : "the workforce holds"
          }`,
    basis:
      savingsRate !== null
        ? `net cash flow ÷ income ≈ ${(savingsRate * 100).toFixed(0)}% savings rate`
        : "net cash flow of the reference month",
    provisional: provisional || flow === null,
  };

  // HAPPINESS — quality of life. Never a sin: low is a warning, high stays warm.
  const share = lifestyleShare(ref);
  let happinessLevel: Level;
  let band: string;
  if (share === null) {
    happinessLevel = 3;
    band = "unmeasured";
  } else if (share < 0.08) {
    happinessLevel = 1;
    band = "the kingdom is quiet — a festival would lift spirits";
  } else if (share < 0.15) {
    happinessLevel = 3;
    band = "content";
  } else if (share <= 0.35) {
    happinessLevel = 5;
    band = "joyful";
  } else {
    happinessLevel = 4;
    band = "the court celebrates richly";
  }
  const happiness: ResourceState = {
    key: "happiness",
    themeName: "Happiness",
    icon: "🎉",
    value: share,
    max: 1,
    unit: "ratio",
    level: happinessLevel,
    displayValue:
      share === null ? "unmeasured" : `${(share * 100).toFixed(0)}% of spending on joy — ${band}`,
    basis: "dining, delivery, coffee, entertainment, travel, subscriptions, shopping",
    provisional: share === null || provisional,
  };

  return [gold, grain, stone, buildersState, happiness];
}
