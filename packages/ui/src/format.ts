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
