import type { ApiMoney } from "./types.js";

export function fmtMoney(m: ApiMoney | null | undefined): string {
  if (m == null) return "—";
  return (m.amountMinor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: m.currency || "USD",
  });
}

/** Translator helpers: coerce unknown payload fields safely. */
export const asMoney = (v: unknown): string => fmtMoney(v as ApiMoney);
export const asStr = (v: unknown): string => String(v ?? "");
export const asNum = (v: unknown): number => Number(v ?? 0);
export const absMoney = (v: unknown): string =>
  fmtMoney({ amountMinor: Math.abs(asNum((v as ApiMoney)?.amountMinor)), currency: "USD" });

/** "2026-07" → "July" — month-over-month is jargon; month names are not. */
export const monthName = (v: unknown): string => {
  const m = /^(\d{4})-(\d{2})/.exec(String(v ?? ""));
  if (m === null) return String(v ?? "");
  const names = [
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
  return names[Number(m[2]) - 1] ?? String(v);
};
