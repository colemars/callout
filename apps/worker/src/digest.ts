/**
 * Renders derived events into a plain-voice email digest. This is the
 * platform's own notification surface (not a product): direct, numeric,
 * no theming — products remain the place for voice.
 */

interface Moneyish {
  amountMinor?: number;
  currency?: string;
}

interface Eventish {
  type: string;
  occurredOn: string;
  [key: string]: unknown;
}

const money = (v: unknown): string => {
  const m = v as Moneyish | null | undefined;
  if (m?.amountMinor === undefined) return "—";
  return (m.amountMinor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: m.currency ?? "USD",
  });
};
const absMoney = (v: unknown): string => {
  const m = v as Moneyish | null | undefined;
  return money({ amountMinor: Math.abs(m?.amountMinor ?? 0), currency: m?.currency });
};
const s = (v: unknown): string => String(v ?? "");
const n = (v: unknown): number => Number(v ?? 0);

export function renderEventLine(e: Eventish): string {
  switch (e.type) {
    case "GOAL_OFF_TRACK":
      return `Goal off track: expected ${money(e.expected)} by now, actual ${money(e.actual)} — ${money(e.shortfall)} short.`;
    case "GOAL_ON_TRACK":
      return `Goal on track: ${money(e.surplus)} ahead of schedule.`;
    case "MONTHLY_SPENDING_INCREASED":
      return `${s(e.category)} spending up ${n(e.deltaPct)}% in ${s(e.month)}: ${money(e.previous)} -> ${money(e.current)}.`;
    case "MONTHLY_SPENDING_DECREASED":
      return `${s(e.category)} spending down ${n(e.deltaPct)}% in ${s(e.month)}: ${money(e.previous)} -> ${money(e.current)}.`;
    case "RECURRING_EXPENSE_ADDED":
      return `New recurring charge: ${s(e.merchant)} (~${money(e.estimatedMonthly)}/mo).`;
    case "RECURRING_EXPENSE_REMOVED":
      return `Recurring charge gone: ${s(e.merchant)} (last seen ${s(e.lastSeen)}).`;
    case "HIGH_INTEREST_DEBT_INCREASED":
      return `High-interest debt up ${money(e.delta)} to ${money(e.current)}.`;
    case "HIGH_INTEREST_DEBT_DECREASED":
      return `High-interest debt down ${money(e.delta)} to ${money(e.current)}.`;
    case "NET_CASH_FLOW_NEGATIVE":
      return `${s(e.month)}: net cash flow negative — ${absMoney(e.netFlow)} more out than in.`;
    case "NET_CASH_FLOW_POSITIVE":
      return `${s(e.month)}: net cash flow positive — ${money(e.netFlow)}.`;
    case "RETIREMENT_CONTRIBUTION_MADE":
      return `Retirement contribution in ${s(e.month)}: ${money(e.amount)}.`;
    case "RETIREMENT_CONTRIBUTION_INCREASED":
      return `Retirement contributions increased: ${money(e.previous)} -> ${money(e.current)}/mo.`;
    case "PASSIVE_INCOME_INCREASED":
      return `Passive income up: ${money(e.previous)} -> ${money(e.current)}.`;
    case "EMERGENCY_RUNWAY_CHANGED":
      return `Emergency runway changed: ${n(e.previousMonths)} -> ${n(e.currentMonths)} months.`;
    default:
      return `${e.type} (${e.occurredOn})`;
  }
}

export interface Digest {
  subject: string;
  text: string;
  html: string;
}

export function renderDigest(asOf: string, events: readonly Eventish[]): Digest | null {
  if (events.length === 0) return null;
  const lines = events.map(renderEventLine);
  const subject = `Your money: ${events.length} thing${events.length === 1 ? "" : "s"} worth knowing (${asOf})`;
  const esc = (t: string) =>
    t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  return {
    subject,
    text: lines.map((l) => `- ${l}`).join("\n"),
    html: `<div style="font-family:-apple-system,sans-serif;max-width:600px"><h2>Daily callout — ${esc(asOf)}</h2><ul>${lines
      .map((l) => `<li>${esc(l)}</li>`)
      .join(
        "",
      )}</ul><p style="color:#888;font-size:12px">From your financial platform. Dashboards: <a href="https://colemars.github.io/callout/app/">Accountability</a> · <a href="https://colemars.github.io/callout/kingdom/">Kingdom</a></p></div>`,
  };
}
