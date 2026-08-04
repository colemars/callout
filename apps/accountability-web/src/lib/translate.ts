import type { ApiMoney } from "./format";
import { fmtMoney } from "./format";

/**
 * The product-translation layer (ARCHITECTURE.md "Product Translation"):
 * normalized platform events become Accountability's plain, direct voice.
 * The platform never knows this voice exists.
 */
interface ApiEvent {
  type: string;
  occurredOn: string;
  payload: Record<string, unknown>;
}

const m = (v: unknown): string => fmtMoney(v as ApiMoney);
const s = (v: unknown): string => String(v ?? "");
const n = (v: unknown): number => Number(v ?? 0);

export function translate(event: ApiEvent): { headline: string; tone: "good" | "bad" | "info" } {
  const p = event.payload;
  switch (event.type) {
    case "GOAL_OFF_TRACK":
      return {
        tone: "bad",
        headline: `You're behind on a goal: expected ${m(p.expected)} by now, you're at ${m(p.actual)} — ${m(p.shortfall)} short.`,
      };
    case "GOAL_ON_TRACK":
      return { tone: "good", headline: `Goal on track — ${m(p.surplus)} ahead of schedule.` };
    case "MONTHLY_SPENDING_INCREASED":
      return {
        tone: "bad",
        headline: `${s(p.category)} spending jumped ${n(p.deltaPct)}% in ${s(p.month)}: ${m(p.previous)} → ${m(p.current)}.`,
      };
    case "MONTHLY_SPENDING_DECREASED":
      return {
        tone: "good",
        headline: `${s(p.category)} spending down ${n(p.deltaPct)}% in ${s(p.month)}: ${m(p.previous)} → ${m(p.current)}.`,
      };
    case "RECURRING_EXPENSE_ADDED":
      return {
        tone: "info",
        headline: `New subscription detected: ${s(p.merchant)} (~${m(p.estimatedMonthly)}/mo).`,
      };
    case "RECURRING_EXPENSE_REMOVED":
      return {
        tone: "info",
        headline: `${s(p.merchant)} looks cancelled — last charged ${s(p.lastSeen)}.`,
      };
    case "HIGH_INTEREST_DEBT_INCREASED":
      return {
        tone: "bad",
        headline: `High-interest debt grew ${m(p.delta)} to ${m(p.current)}.`,
      };
    case "HIGH_INTEREST_DEBT_DECREASED":
      return {
        tone: "good",
        headline: `You paid high-interest debt down ${m(p.delta)} to ${m(p.current)}.`,
      };
    case "NET_CASH_FLOW_NEGATIVE":
      return {
        tone: "bad",
        headline: `${s(p.month)}: you spent ${m({ amountMinor: Math.abs(n((p.netFlow as ApiMoney)?.amountMinor)), currency: "USD" })} more than you made.`,
      };
    case "NET_CASH_FLOW_POSITIVE":
      return { tone: "good", headline: `${s(p.month)}: ${m(p.netFlow)} net positive.` };
    case "PASSIVE_INCOME_INCREASED":
      return { tone: "good", headline: `Passive income up: ${m(p.previous)} → ${m(p.current)}.` };
    case "EMERGENCY_RUNWAY_CHANGED": {
      const prev = n(p.previousMonths);
      const curr = n(p.currentMonths);
      return {
        tone: curr < prev ? "bad" : "good",
        headline: `Emergency runway ${curr < prev ? "shrank" : "grew"}: ${prev} → ${curr} months.`,
      };
    }
    default:
      return { tone: "info", headline: `${event.type} on ${event.occurredOn}` };
  }
}
