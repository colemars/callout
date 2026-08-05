// Plaid Liabilities: the bank-reported cost of debt — APRs, minimum payments,
// due dates. One snapshot per account per sync; no cursors, no sign
// conventions. Rates travel as basis points (29.99% -> 2999).
import type { ISODate, LiabilityKind } from "@platform/financial-core";
import type { PlaidHttp } from "../plaid/client.js";
import { dollarsToMinor } from "../plaid/provider.js";

/** Provider-shaped liability snapshot; sync maps externalAccountId → platform account. */
export interface ProviderLiability {
  readonly externalAccountId: string;
  readonly kind: LiabilityKind;
  readonly aprBps?: number;
  readonly aprType?: string;
  readonly minPaymentMinor?: number;
  readonly nextDueDate?: ISODate;
  readonly isOverdue?: boolean;
  readonly lastPaymentMinor?: number;
}

export interface LiabilitiesProvider {
  fetchLiabilities(accessToken: string): Promise<ProviderLiability[]>;
}

export function createPlaidLiabilitiesProvider(client: PlaidHttp): LiabilitiesProvider {
  return {
    async fetchLiabilities(accessToken) {
      const resp = (await client.post("/liabilities/get", {
        access_token: accessToken,
      })) as unknown as PlaidLiabilitiesResponse;
      const out: ProviderLiability[] = [];
      for (const c of resp.liabilities.credit ?? []) {
        if (c.account_id === null) continue;
        const apr = pickCreditApr(c.aprs ?? []);
        out.push({
          externalAccountId: c.account_id,
          kind: "credit",
          ...(apr === null ? {} : { aprBps: apr.aprBps, aprType: apr.aprType }),
          ...(c.minimum_payment_amount == null
            ? {}
            : { minPaymentMinor: dollarsToMinor(c.minimum_payment_amount) }),
          ...(c.next_payment_due_date == null
            ? {}
            : { nextDueDate: c.next_payment_due_date as ISODate }),
          ...(c.is_overdue == null ? {} : { isOverdue: c.is_overdue }),
          ...(c.last_payment_amount == null
            ? {}
            : { lastPaymentMinor: dollarsToMinor(c.last_payment_amount) }),
        });
      }
      for (const s of resp.liabilities.student ?? []) {
        if (s.account_id === null) continue;
        out.push({
          externalAccountId: s.account_id,
          kind: "student",
          ...(s.interest_rate_percentage == null
            ? {}
            : { aprBps: Math.round(s.interest_rate_percentage * 100), aprType: "interest_rate" }),
          ...(s.minimum_payment_amount == null
            ? {}
            : { minPaymentMinor: dollarsToMinor(s.minimum_payment_amount) }),
          ...(s.next_payment_due_date == null
            ? {}
            : { nextDueDate: s.next_payment_due_date as ISODate }),
          ...(s.is_overdue == null ? {} : { isOverdue: s.is_overdue }),
        });
      }
      for (const m of resp.liabilities.mortgage ?? []) {
        if (m.account_id === null) continue;
        out.push({
          externalAccountId: m.account_id,
          kind: "mortgage",
          ...(m.interest_rate?.percentage == null
            ? {}
            : {
                aprBps: Math.round(m.interest_rate.percentage * 100),
                aprType: m.interest_rate.type ?? "interest_rate",
              }),
          ...(m.next_monthly_payment == null
            ? {}
            : { minPaymentMinor: dollarsToMinor(m.next_monthly_payment) }),
          ...(m.next_payment_due_date == null
            ? {}
            : { nextDueDate: m.next_payment_due_date as ISODate }),
        });
      }
      return out;
    },
  };
}

/**
 * Which of a card's APRs is THE rate: the purchase APR when present (what
 * carried balances actually accrue at), else the highest. Null when the bank
 * reported none — silence over a made-up number.
 */
export function pickCreditApr(
  aprs: readonly PlaidApr[],
): { aprBps: number; aprType: string } | null {
  const candidates = aprs.filter((a) => a.apr_percentage != null);
  if (candidates.length === 0) return null;
  const purchase = candidates.find((a) => a.apr_type === "purchase_apr");
  const chosen =
    purchase ??
    candidates.reduce((best, a) =>
      (a.apr_percentage ?? 0) > (best.apr_percentage ?? 0) ? a : best,
    );
  return {
    // biome-ignore lint/style/noNonNullAssertion: filtered on != null above
    aprBps: Math.round(chosen.apr_percentage! * 100),
    aprType: chosen.apr_type ?? "unknown",
  };
}

export interface PlaidApr {
  apr_percentage: number | null;
  apr_type: string | null;
}

interface PlaidCreditLiability {
  account_id: string | null;
  aprs: PlaidApr[] | null;
  is_overdue: boolean | null;
  last_payment_amount: number | null;
  minimum_payment_amount: number | null;
  next_payment_due_date: string | null;
}

interface PlaidStudentLiability {
  account_id: string | null;
  interest_rate_percentage: number | null;
  is_overdue: boolean | null;
  minimum_payment_amount: number | null;
  next_payment_due_date: string | null;
}

interface PlaidMortgageLiability {
  account_id: string | null;
  interest_rate: { percentage: number | null; type: string | null } | null;
  next_monthly_payment: number | null;
  next_payment_due_date: string | null;
}

interface PlaidLiabilitiesResponse {
  liabilities: {
    credit: PlaidCreditLiability[] | null;
    student: PlaidStudentLiability[] | null;
    mortgage: PlaidMortgageLiability[] | null;
  };
}
