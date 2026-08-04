import type { ApiEvent, TranslatedEvent } from "@platform/ui";
import { absMoney, asMoney, asNum, asStr } from "@platform/ui";

/**
 * The same normalized platform events, in the Kingdom's voice.
 * The platform never knows kingdoms exist (ARCHITECTURE.md "Product Translation").
 */
export function translate(event: ApiEvent): TranslatedEvent {
  const p = event.payload;
  switch (event.type) {
    case "GOAL_OFF_TRACK":
      return {
        tone: "bad",
        headline: `The grain stores are filling more slowly than decreed — ${asMoney(p.shortfall)} short of the harvest plan.`,
      };
    case "GOAL_ON_TRACK":
      return {
        tone: "good",
        headline: `The granaries swell ${asMoney(p.surplus)} ahead of the royal plan.`,
      };
    case "MONTHLY_SPENDING_INCREASED":
      return {
        tone: "bad",
        headline: `The court's spending on ${asStr(p.category)} rose ${asNum(p.deltaPct)}% last moon: ${asMoney(p.previous)} → ${asMoney(p.current)}.`,
      };
    case "MONTHLY_SPENDING_DECREASED":
      return {
        tone: "good",
        headline: `Thrift prevails: ${asStr(p.category)} spending fell ${asNum(p.deltaPct)}% last moon.`,
      };
    case "RECURRING_EXPENSE_ADDED":
      return {
        tone: "info",
        headline: `A new tithe binds the treasury: ${asStr(p.merchant)}, ~${asMoney(p.estimatedMonthly)} each moon.`,
      };
    case "RECURRING_EXPENSE_REMOVED":
      return {
        tone: "info",
        headline: `The tithe to ${asStr(p.merchant)} has been lifted from the realm.`,
      };
    case "HIGH_INTEREST_DEBT_INCREASED":
      return {
        tone: "bad",
        headline: `The moneylenders' claim grows by ${asMoney(p.delta)} — ${asMoney(p.current)} now owed.`,
      };
    case "HIGH_INTEREST_DEBT_DECREASED":
      return {
        tone: "good",
        headline: `The crown repays the moneylenders ${asMoney(p.delta)}; ${asMoney(p.current)} remains.`,
      };
    case "NET_CASH_FLOW_NEGATIVE":
      return {
        tone: "bad",
        headline: `In the moon of ${asStr(p.month)}, the treasury bled ${absMoney(p.netFlow)}.`,
      };
    case "NET_CASH_FLOW_POSITIVE":
      return {
        tone: "good",
        headline: `The moon of ${asStr(p.month)} filled the coffers by ${asMoney(p.netFlow)}.`,
      };
    case "PASSIVE_INCOME_INCREASED":
      return {
        tone: "good",
        headline: `The realm's estates yield more: ${asMoney(p.previous)} → ${asMoney(p.current)}.`,
      };
    case "EMERGENCY_RUNWAY_CHANGED": {
      const prev = asNum(p.previousMonths);
      const curr = asNum(p.currentMonths);
      return {
        tone: curr < prev ? "bad" : "good",
        headline: `Under siege, the stores would last ${curr} moons (was ${prev}).`,
      };
    }
    default:
      return { tone: "info", headline: `A raven arrives: ${event.type} (${event.occurredOn}).` };
  }
}
