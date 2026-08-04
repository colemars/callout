export interface ApiMoney {
  amountMinor: number;
  currency: string;
}

export function fmtMoney(m: ApiMoney | null | undefined): string {
  if (m == null) return "—";
  return (m.amountMinor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: m.currency || "USD",
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso;
}
