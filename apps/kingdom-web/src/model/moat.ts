import { fmtMinor, incomeEstimate, recurringLoad, referenceMonths, sumBalances } from "./derive";
import type { KingdomInput, MoatComponent, MoatState } from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The moat is the realm's MARGIN OF SAFETY, not its wealth: a $5M castle with
 * no cash keeps a narrow moat. Insurance and income diversification belong
 * here but the chroniclers do not yet record them.
 */
export function computeMoat(input: KingdomInput): MoatState {
  const { ref, provisional } = referenceMonths(input.metrics);
  const runway = input.metrics?.emergencyRunwayMonths ?? null;
  const goldMinor = sumBalances(input.accounts, "liquid");
  const stoneMinor =
    sumBalances(input.accounts, "retirement") + sumBalances(input.accounts, "brokerage");
  const highInterest = input.metrics?.totalHighInterestDebt?.amountMinor ?? 0;
  const nonMortgageDebt = highInterest + Math.abs(sumBalances(input.accounts, "student"));
  const spend = ref?.totalSpending.amountMinor ?? null;
  const income = incomeEstimate(ref);
  const tithes = recurringLoad(input.metrics);

  const runwayComp: MoatComponent = {
    key: "runway",
    label: "Grain against the siege",
    score: runway === null ? 0 : Math.round(30 * clamp01(runway / 6)),
    max: 30,
    evidence: runway === null ? "runway unmeasured" : `${runway} months of runway (full at 6)`,
    provisional: runway === null,
  };

  const assets = Math.max(goldMinor + stoneMinor, 1);
  const leverageComp: MoatComponent = {
    key: "leverage",
    label: "Debts held at bay",
    score: Math.round(30 * clamp01(1 - nonMortgageDebt / assets)),
    max: 30,
    evidence: `${fmtMinor(nonMortgageDebt)} owed (excl. manor pledge) against ${fmtMinor(goldMinor + stoneMinor)} of holdings`,
    provisional: false,
  };

  const goldMonths = spend !== null && spend > 0 ? goldMinor / spend : null;
  const liquidityComp: MoatComponent = {
    key: "liquidity",
    label: "Gold within reach",
    score: goldMonths === null ? 20 : Math.round(20 * clamp01(goldMonths / 3)),
    max: 20,
    evidence:
      goldMonths === null
        ? "no full month of spending recorded yet"
        : `${goldMonths.toFixed(1)} months of spending held in gold (full at 3)`,
    provisional: goldMonths === null,
  };

  const obligationsComp: MoatComponent = {
    key: "obligations",
    label: "Light standing tithes",
    score:
      income === null || tithes === 0 ? 20 : Math.round(20 * clamp01(1 - tithes / income / 0.5)),
    max: 20,
    evidence:
      tithes === 0
        ? "no standing tithes recorded yet (a tithe needs three sightings)"
        : income === null
          ? `${fmtMinor(tithes)}/mo in tithes; income unmeasured`
          : `${fmtMinor(tithes)}/mo in tithes against ${fmtMinor(income)}/mo income`,
    provisional: income === null || tithes === 0 || provisional,
  };

  const components = [runwayComp, leverageComp, liquidityComp, obligationsComp];
  const uncapped = components.reduce((sum, c) => sum + c.score, 0);
  const cappedByBandits = highInterest > 0 && uncapped > 74;
  const score = cappedByBandits ? 74 : uncapped;

  const tier = score < 25 ? "dry" : score < 50 ? "narrow" : score < 75 ? "broad" : "vast";
  const tierLabel = {
    dry: "The moat is a dry ditch",
    narrow: "The moat runs narrow",
    broad: "The moat runs broad",
    vast: "The moat is vast — few armies would try it",
  }[tier];

  return { score, uncapped, cappedByBandits, tier, tierLabel, components };
}
