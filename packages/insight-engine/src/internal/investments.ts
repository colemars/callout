import type { ISODate, ISOMonth, InvestmentActivity, Money } from "@platform/financial-core";
import { money, monthOf, multiplyRatio, sumOf } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { InvestmentSummary } from "../metrics.js";
import { lastFullMonths } from "./runway.js";

const PASSIVE_KINDS = ["dividend", "interest"];

function sumKinds(
  activity: readonly InvestmentActivity[],
  month: ISOMonth,
  kinds: readonly string[],
  config: EngineConfig,
): Money {
  return sumOf(
    activity
      .filter(
        (a) => monthOf(a.date) === month && kinds.includes(a.kind) && a.amount.amountMinor > 0,
      )
      .map((a) => a.amount),
    config.currency,
  );
}

export function summarizeInvestments(
  activity: readonly InvestmentActivity[],
  asOf: ISODate,
  config: EngineConfig,
): InvestmentSummary {
  const currentMonth = monthOf(asOf);
  const months = lastFullMonths(asOf, 3); // oldest first; last entry = completed month
  const completedMonth = months[months.length - 1];
  const priorMonth = months[months.length - 2];

  const contributions = (m: ISOMonth | undefined): Money =>
    m === undefined ? money(0, config.currency) : sumKinds(activity, m, ["contribution"], config);
  const passive = (m: ISOMonth | undefined): Money =>
    m === undefined ? money(0, config.currency) : sumKinds(activity, m, PASSIVE_KINDS, config);

  const trailingPassiveMinor = months.reduce((sum, m) => sum + passive(m).amountMinor, 0);

  return {
    contributionsMtd: sumKinds(activity, currentMonth, ["contribution"], config),
    contributionsCompletedMonth: contributions(completedMonth),
    contributionsPriorMonth: contributions(priorMonth),
    passiveIncomeCompletedMonth: passive(completedMonth),
    passiveIncomePriorMonth: passive(priorMonth),
    passiveIncomeMonthly:
      activity.length === 0
        ? null
        : multiplyRatio(money(trailingPassiveMinor, config.currency), 1, months.length),
  };
}
