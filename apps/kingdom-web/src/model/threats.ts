import {
  ESSENTIAL_CATEGORIES,
  FEAST_CATEGORIES,
  categorySum,
  classifyAccount,
  fmtMinor,
  incomeEstimate,
  lifestyleShare,
  monthName,
  referenceMonths,
} from "./derive";
import type { KingdomInput, ThreatBreakdownLine, ThreatState } from "./types";

type Severity = ThreatState["severity"];

const dormant = (
  kind: ThreatState["kind"],
  title: string,
  reason: "no-data" | "conditions-clear",
): ThreatState => ({
  kind,
  active: false,
  dormantReason: reason,
  severity: 0,
  title,
  narrative: "",
  causes: [],
  basis: reason === "no-data" ? "not enough recorded moons to judge" : "conditions clear",
});

/** Per-category prev→curr lines for a comparative threat, largest rise first. */
function categoryBreakdown(
  ref: { spendingByCategory: { category: string; amount: { amountMinor: number } }[] },
  prior: { spendingByCategory: { category: string; amount: { amountMinor: number } }[] },
  categories: readonly string[],
): ThreatBreakdownLine[] {
  const sums = (m: typeof ref): Map<string, number> => {
    const map = new Map<string, number>();
    for (const s of m.spendingByCategory) {
      if (categories.includes(s.category)) map.set(s.category, Math.abs(s.amount.amountMinor));
    }
    return map;
  };
  const now = sums(ref);
  const before = sums(prior);
  const lines: ThreatBreakdownLine[] = [];
  for (const category of categories) {
    const currentMinor = now.get(category) ?? 0;
    const previousMinor = before.get(category) ?? 0;
    if (currentMinor === 0 && previousMinor === 0) continue;
    lines.push({
      label: category,
      previousMinor,
      currentMinor,
      deltaMinor: currentMinor - previousMinor,
    });
  }
  return lines.sort((a, b) => b.deltaMinor - a.deltaMinor);
}

/** Estimated monthly interest across credit accounts with a bank-reported APR. */
export function banditToll(accounts: readonly KingdomInput["accounts"][number][]): {
  tollMinor: number;
  hiddenCount: number;
} {
  let tollMinor = 0;
  let hiddenCount = 0;
  for (const a of accounts) {
    if (classifyAccount(a) !== "credit" || a.balance.amountMinor <= 0) continue;
    if (a.apr === undefined) hiddenCount++;
    else tollMinor += Math.round((a.balance.amountMinor * a.apr) / 100 / 12);
  }
  return { tollMinor, hiddenCount };
}

function daysUntil(todayIso: string, dateIso: string): number | null {
  const today = Date.parse(todayIso);
  const date = Date.parse(dateIso);
  if (Number.isNaN(today) || Number.isNaN(date)) return null;
  return Math.round((date - today) / 86_400_000);
}

export function computeThreats(input: KingdomInput): ThreatState[] {
  const { ref, prior } = referenceMonths(input.metrics);
  const threats: ThreatState[] = [];

  // BANDITS — high-interest debt raids the countryside.
  const highInterest = input.metrics?.totalHighInterestDebt?.amountMinor ?? 0;
  if (highInterest > 0) {
    const severity: Severity = highInterest < 1_000_00 ? 1 : highInterest < 10_000_00 ? 2 : 3;
    // The raiders' toll: real APR × balance for cards the bank reported a rate
    // for. Cards without a reported rate simply show no rate — never a guess.
    const { tollMinor } = banditToll(input.accounts);
    // One line per raiding card, largest hoard first: rate, toll, trend, and
    // any looming tribute all ride on the card's own line.
    const causes = (input.metrics?.debtTrajectory ?? [])
      .filter((d) => {
        const account = input.accounts.find((a) => a.id === d.accountId);
        return (
          account !== undefined &&
          classifyAccount(account) === "credit" &&
          d.currentBalance.amountMinor > 0
        );
      })
      .sort((a, b) => b.currentBalance.amountMinor - a.currentBalance.amountMinor)
      .map((d) => {
        const account = input.accounts.find((a) => a.id === d.accountId);
        const parts: string[] = [];
        const apr = account?.apr;
        if (apr !== undefined) {
          parts.push(
            `${apr}% ≈ ${fmtMinor(Math.round((d.currentBalance.amountMinor * apr) / 100 / 12))}/moon`,
          );
        }
        if (d.delta30d !== null) {
          parts.push(d.delta30d.amountMinor > 0 ? "growing" : "shrinking");
        }
        const due =
          account?.nextDueDate === undefined ? null : daysUntil(input.today, account.nextDueDate);
        if (account?.isOverdue === true) parts.push("⚠ tribute OVERDUE");
        else if (due !== null && due >= 0 && due <= 7)
          parts.push(`tribute in ${due} day${due === 1 ? "" : "s"}`);
        return {
          label: `${d.institution} ${d.name}${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`,
          amount: d.currentBalance,
        };
      });
    const tollLine =
      tollMinor > 0
        ? ` Each moon they take ≈ ${fmtMinor(tollMinor)} in interest.`
        : " Each moon they take their toll in interest.";
    threats.push({
      kind: "bandits",
      active: true,
      severity,
      title: "Bandits raid the countryside",
      narrative: `Raiders hold ${fmtMinor(highInterest)} of the realm's coin.${tollLine} Drive them out and the roads grow safe for merchants.`,
      causes,
      basis:
        tollMinor > 0
          ? "high-interest debt (credit balances); toll from bank-reported APRs"
          : "high-interest debt (credit balances)",
    });
  } else {
    threats.push(dormant("bandits", "Bandits", "conditions-clear"));
  }

  // Comparative threats need two full months.
  if (ref === null || prior === null) {
    threats.push(dormant("winter", "Winter", "no-data"));
    threats.push(dormant("feast", "Royal feasts", "no-data"));
    threats.push(dormant("drought", "Drought", "no-data"));
  } else {
    // WINTER — essential costs rising (inflation proxy: the realm's own spend).
    const essNow = categorySum(ref, ESSENTIAL_CATEGORIES);
    const essPrior = categorySum(prior, ESSENTIAL_CATEGORIES);
    const essRise = essPrior > 0 ? essNow / essPrior - 1 : 0;
    if (essPrior > 0 && essRise >= 0.08 && essNow - essPrior >= 50_00) {
      threats.push({
        kind: "winter",
        active: true,
        severity: essRise < 0.15 ? 1 : essRise < 0.3 ? 2 : 3,
        title: "Winter deepens",
        narrative: `The cost of keeping the realm fed and warm rose ${(essRise * 100).toFixed(0)}% last moon (${fmtMinor(essPrior)} → ${fmtMinor(essNow)}). The granary drains faster through no fault of the court.`,
        causes: [
          {
            label: `keeping the realm fed cost ${fmtMinor(essNow - essPrior)} more in ${monthName(ref.month)} than in ${monthName(prior.month)}`,
          },
        ],
        basis: "groceries + housing + transport + health, completed vs prior month",
        breakdown: categoryBreakdown(ref, prior, ESSENTIAL_CATEGORIES),
        months: { current: ref.month, previous: prior.month },
      });
    } else {
      threats.push(dormant("winter", "Winter", "conditions-clear"));
    }

    // ROYAL FEAST — lifestyle creep is a JUMP, never a level. Travel excluded.
    const feastNow = categorySum(ref, FEAST_CATEGORIES);
    const feastPrior = categorySum(prior, FEAST_CATEGORIES);
    const share = lifestyleShare(ref) ?? 0;
    const feastRise = feastPrior > 0 ? feastNow / feastPrior - 1 : 0;
    if (feastPrior > 0 && feastRise >= 0.25 && feastNow - feastPrior >= 100_00 && share > 0.35) {
      threats.push({
        kind: "feast",
        active: true,
        severity: feastRise < 0.5 ? 1 : feastRise < 1 ? 2 : 3,
        title: "The feasts grow grander",
        narrative: `The court feasts grandly — joy runs high, the coffers lighter (${fmtMinor(feastPrior)} → ${fmtMinor(feastNow)} last moon). A merry realm, if the granary agrees.`,
        causes: [
          {
            label: `the court spent ${fmtMinor(feastNow - feastPrior)} more on merriment in ${monthName(ref.month)} than in ${monthName(prior.month)}`,
          },
        ],
        basis: "lifestyle spending excluding travel, completed vs prior month",
        breakdown: categoryBreakdown(ref, prior, FEAST_CATEGORIES),
        months: { current: ref.month, previous: prior.month },
      });
    } else {
      threats.push(dormant("feast", "Royal feasts", "conditions-clear"));
    }

    // DROUGHT — income loss.
    const incomeNow = incomeEstimate(ref);
    const incomePrior = incomeEstimate(prior);
    const droughtHit =
      incomePrior !== null &&
      ((incomeNow !== null &&
        incomeNow <= incomePrior * 0.8 &&
        incomePrior - incomeNow >= 250_00) ||
        (incomeNow === null && incomePrior > 500_00));
    if (droughtHit && incomePrior !== null) {
      const drop = incomeNow === null ? 1 : 1 - incomeNow / incomePrior;
      threats.push({
        kind: "drought",
        active: true,
        severity: drop < 0.35 ? 1 : drop < 0.7 ? 2 : 3,
        title: "Drought grips the fields",
        narrative: `Less tribute arrives than the moon before (${fmtMinor(incomePrior)} → ${fmtMinor(incomeNow ?? 0)}). Workers drift away while the harvest is thin.`,
        causes: [
          {
            label: `${fmtMinor(incomePrior - (incomeNow ?? 0))} less tribute arrived in ${monthName(ref.month)} than in ${monthName(prior.month)}`,
          },
        ],
        basis: "income ≈ net cash flow + spending, completed vs prior month",
        breakdown: [
          {
            label: "income",
            previousMinor: incomePrior,
            currentMinor: incomeNow ?? 0,
            deltaMinor: (incomeNow ?? 0) - incomePrior,
            risingIsGood: true,
          },
        ],
        months: { current: ref.month, previous: prior.month },
      });
    } else {
      threats.push(
        dormant("drought", "Drought", incomePrior === null ? "no-data" : "conditions-clear"),
      );
    }
  }

  // CASTLE FIRE — one large unexpected expense in the last 45 days.
  const spend = ref?.totalSpending.amountMinor ?? null;
  const fireFloor = Math.max(spend === null ? 0 : Math.round(spend * 0.4), 500_00);
  const cutoff = new Date(new Date(input.today).getTime() - 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const runway = input.metrics?.emergencyRunwayMonths ?? null;
  const fireTxn = input.transactions
    .filter(
      (t) =>
        !t.pending &&
        t.postedAt >= cutoff &&
        t.amount.amountMinor < 0 &&
        Math.abs(t.amount.amountMinor) >= fireFloor &&
        !["transfer", "debt_payment", "income", "housing", "travel"].includes(t.category),
    )
    .sort((a, b) => a.amount.amountMinor - b.amount.amountMinor)[0];
  if (fireTxn !== undefined && spend !== null) {
    const size = Math.abs(fireTxn.amount.amountMinor);
    const ratio = size / spend;
    threats.push({
      kind: "fire",
      active: true,
      severity: ratio < 0.8 ? 1 : ratio < 1.5 ? 2 : 3,
      title: "Fire in the district",
      narrative:
        runway !== null && runway >= 3
          ? `A sudden blaze — ${fmtMinor(size)} to ${fireTxn.merchant ?? fireTxn.description} on ${fireTxn.postedAt}. The granary absorbed it; this is what the stores are for.`
          : `A sudden blaze — ${fmtMinor(size)} to ${fireTxn.merchant ?? fireTxn.description} on ${fireTxn.postedAt} — and the stores run thin.`,
      causes: [{ label: fireTxn.merchant ?? fireTxn.description, amount: fireTxn.amount }],
      basis: "single outsized expense in the last 45 days",
    });
  } else {
    threats.push(dormant("fire", "Fires", spend === null ? "no-data" : "conditions-clear"));
  }

  return threats;
}
