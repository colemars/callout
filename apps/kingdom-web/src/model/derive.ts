import type { ApiMoney } from "@platform/ui";
import type { KingdomAccount, KingdomMetrics, MonthSummaryView } from "./types";

/** Shared derivations. Money is minor units throughout. */

// Mirrors packages/insight-engine config (documented duplication — products
// consume the API, not platform internals).
export const ESSENTIAL_CATEGORIES = ["groceries", "housing", "transport", "health"];
export const LIFESTYLE_CATEGORIES = [
  "dining",
  "delivery",
  "coffee",
  "entertainment",
  "travel",
  "subscriptions",
  "shopping",
];
/** Lifestyle minus travel — a vacation is not lifestyle creep. */
export const FEAST_CATEGORIES = LIFESTYLE_CATEGORIES.filter((c) => c !== "travel");

const LIQUID_SUBTYPES = ["checking", "savings", "money market", "cash management", "cd"];
const RETIREMENT_SUBTYPES = ["401k", "403b", "457b", "ira", "roth", "roth 401k", "pension", "hsa"];

export type AccountClass =
  | "liquid"
  | "retirement"
  | "brokerage"
  | "mortgage"
  | "student"
  | "credit"
  | "other";

export function classifyAccount(a: KingdomAccount): AccountClass {
  const subtype = (a.subtype ?? "").toLowerCase();
  if (RETIREMENT_SUBTYPES.includes(subtype)) return "retirement";
  if (a.kind === "credit") return "credit";
  if (a.kind === "loan") {
    if (subtype.includes("mortgage") || subtype.includes("home equity")) return "mortgage";
    if (subtype.includes("student")) return "student";
    return "other";
  }
  if (a.kind === "investment") return "brokerage";
  if (a.kind === "depository") {
    if (subtype === "" || LIQUID_SUBTYPES.includes(subtype)) return "liquid";
    return "other";
  }
  return "other";
}

export function sumBalances(accounts: readonly KingdomAccount[], cls: AccountClass): number {
  return accounts
    .filter((a) => classifyAccount(a) === cls)
    .reduce((sum, a) => sum + a.balance.amountMinor, 0);
}

export function money(amountMinor: number): ApiMoney {
  return { amountMinor, currency: "USD" };
}

export function fmtMinor(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export interface RefMonths {
  /** The month the kingdom is judged on. */
  ref: MonthSummaryView | null;
  /** Comparison baseline (the month before ref); null → comparative threats dormant. */
  prior: MonthSummaryView | null;
  /** True when ref is the incomplete month-to-date. */
  provisional: boolean;
}

export function referenceMonths(metrics: KingdomMetrics | null): RefMonths {
  if (metrics === null) return { ref: null, prior: null, provisional: true };
  const completed = metrics.completedMonth;
  if (completed !== undefined && completed.transactionCount > 0) {
    const prior =
      metrics.priorMonth !== undefined && metrics.priorMonth.transactionCount > 0
        ? metrics.priorMonth
        : null;
    return { ref: completed, prior, provisional: false };
  }
  const mtd = metrics.mtd;
  if (mtd !== undefined && mtd.transactionCount > 0) {
    return { ref: mtd, prior: null, provisional: true };
  }
  return { ref: null, prior: null, provisional: true };
}

export function categorySum(month: MonthSummaryView, categories: readonly string[]): number {
  return month.spendingByCategory
    .filter((s) => categories.includes(s.category))
    .reduce((sum, s) => sum + s.amount.amountMinor, 0);
}

/**
 * Income estimate for a month: net cash flow + spending (both already exclude
 * transfers/debt payments per the engine's cash-flow rules). Null when
 * non-positive — income-relative judgments are then skipped, never failed.
 */
export function incomeEstimate(month: MonthSummaryView | null): number | null {
  if (month === null) return null;
  const income = month.netCashFlow.amountMinor + month.totalSpending.amountMinor;
  return income > 0 ? income : null;
}

export function lifestyleShare(month: MonthSummaryView | null): number | null {
  if (month === null || month.totalSpending.amountMinor === 0) return null;
  return categorySum(month, LIFESTYLE_CATEGORIES) / month.totalSpending.amountMinor;
}

/** Σ recurring candidates' average amounts — the realm's standing tithes. */
export function recurringLoad(metrics: KingdomMetrics | null): number {
  return (metrics?.recurringCandidates ?? []).reduce(
    (sum, r) => sum + r.averageAmount.amountMinor,
    0,
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-07" → "July" — the model speaks month names, not ISO codes. */
export function monthName(isoMonth: string): string {
  const m = /^\d{4}-(\d{2})/.exec(isoMonth);
  return m === null ? isoMonth : (MONTH_NAMES[Number(m[1]) - 1] ?? isoMonth);
}

/** Whole days from today to a date (negative = past); null on unparseable input. */
export function daysUntil(todayIso: string, dateIso: string): number | null {
  const today = Date.parse(todayIso);
  const date = Date.parse(dateIso);
  if (Number.isNaN(today) || Number.isNaN(date)) return null;
  return Math.round((date - today) / 86_400_000);
}

/** ISO date + N days, UTC — no clock reads, no DST. */
export function plusDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
