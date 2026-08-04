import type { ApiEvent, TranslatedEvent } from "@platform/ui";
import { absMoney, asMoney, asNum, asStr } from "@platform/ui";

/**
 * The product-translation layer (ARCHITECTURE.md "Product Translation"):
 * normalized platform events in Accountability's plain, direct voice.
 */
export function translate(event: ApiEvent): TranslatedEvent {
  const p = event.payload;
  switch (event.type) {
    case "GOAL_OFF_TRACK":
      return {
        tone: "bad",
        headline: `You're behind on a goal: expected ${asMoney(p.expected)} by now, you're at ${asMoney(p.actual)} — ${asMoney(p.shortfall)} short.`,
      };
    case "GOAL_ON_TRACK":
      return { tone: "good", headline: `Goal on track — ${asMoney(p.surplus)} ahead of schedule.` };
    case "MONTHLY_SPENDING_INCREASED":
      return {
        tone: "bad",
        headline: `${asStr(p.category)} spending jumped ${asNum(p.deltaPct)}% in ${asStr(p.month)}: ${asMoney(p.previous)} → ${asMoney(p.current)}.`,
      };
    case "MONTHLY_SPENDING_DECREASED":
      return {
        tone: "good",
        headline: `${asStr(p.category)} spending down ${asNum(p.deltaPct)}% in ${asStr(p.month)}: ${asMoney(p.previous)} → ${asMoney(p.current)}.`,
      };
    case "RECURRING_EXPENSE_ADDED":
      return {
        tone: "info",
        headline: `New subscription detected: ${asStr(p.merchant)} (~${asMoney(p.estimatedMonthly)}/mo).`,
      };
    case "RECURRING_EXPENSE_REMOVED":
      return {
        tone: "info",
        headline: `${asStr(p.merchant)} looks cancelled — last charged ${asStr(p.lastSeen)}.`,
      };
    case "HIGH_INTEREST_DEBT_INCREASED":
      return {
        tone: "bad",
        headline: `High-interest debt grew ${asMoney(p.delta)} to ${asMoney(p.current)}.`,
      };
    case "HIGH_INTEREST_DEBT_DECREASED":
      return {
        tone: "good",
        headline: `You paid high-interest debt down ${asMoney(p.delta)} to ${asMoney(p.current)}.`,
      };
    case "NET_CASH_FLOW_NEGATIVE":
      return {
        tone: "bad",
        headline: `${asStr(p.month)}: you spent ${absMoney(p.netFlow)} more than you made.`,
      };
    case "NET_CASH_FLOW_POSITIVE":
      return { tone: "good", headline: `${asStr(p.month)}: ${asMoney(p.netFlow)} net positive.` };
    case "RETIREMENT_CONTRIBUTION_MADE":
      return {
        tone: "good",
        headline: `You put ${asMoney(p.amount)} into retirement in ${asStr(p.month)}.`,
      };
    case "RETIREMENT_CONTRIBUTION_INCREASED":
      return {
        tone: "good",
        headline: `Retirement contributions up: ${asMoney(p.previous)} → ${asMoney(p.current)}/mo. That compounds.`,
      };
    case "PASSIVE_INCOME_INCREASED":
      return {
        tone: "good",
        headline: `Passive income up: ${asMoney(p.previous)} → ${asMoney(p.current)}.`,
      };
    case "EMERGENCY_RUNWAY_CHANGED": {
      const prev = asNum(p.previousMonths);
      const curr = asNum(p.currentMonths);
      return {
        tone: curr < prev ? "bad" : "good",
        headline: `Emergency runway ${curr < prev ? "shrank" : "grew"}: ${prev} → ${curr} months.`,
      };
    }
    default:
      return { tone: "info", headline: `${event.type} on ${event.occurredOn}` };
  }
}
