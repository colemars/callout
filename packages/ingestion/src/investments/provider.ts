import type { ISODate, InvestmentActivityKind } from "@platform/financial-core";
import { isoDate } from "@platform/financial-core";
import type { PlaidHttp } from "../plaid/client.js";
import { dollarsToMinor } from "../plaid/provider.js";

/** One activity record as the provider reports it — platform sign convention. */
export interface ProviderInvestmentActivity {
  readonly externalAccountId: string;
  readonly sourceActivityId: string;
  readonly date: ISODate;
  readonly description: string;
  readonly kind: InvestmentActivityKind;
  /** SIGNED minor units: positive = cash INTO the account. */
  readonly amountMinor: number;
  readonly ticker?: string;
  readonly quantity?: string;
}

export interface InvestmentsProvider {
  /** All activity in [startDate, endDate], newest last. */
  fetchActivity(
    accessToken: string,
    startDate: ISODate,
    endDate: ISODate,
  ): Promise<ProviderInvestmentActivity[]>;
}

/**
 * Plaid Investments provider. Sign convention: Plaid reports investment
 * transaction `amount` as positive when cash LEAVES the account's cash
 * balance (buys) and negative when cash ARRIVES (contributions, dividends,
 * sells) — the same debit-positive convention as banking transactions.
 * The platform stores positive = cash in, so amounts are negated here and
 * nowhere else. Locked by the golden fixture test.
 */
export function createPlaidInvestmentsProvider(client: PlaidHttp): InvestmentsProvider {
  return {
    async fetchActivity(accessToken, startDate, endDate) {
      const all: ProviderInvestmentActivity[] = [];
      const securities = new Map<string, PlaidSecurity>();
      let offset = 0;
      for (;;) {
        const resp = (await client.post("/investments/transactions/get", {
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: { count: 500, offset },
        })) as unknown as PlaidInvestmentsResponse;
        for (const s of resp.securities ?? []) {
          securities.set(s.security_id, s);
        }
        for (const t of resp.investment_transactions) {
          all.push(mapActivity(t, securities));
        }
        offset += resp.investment_transactions.length;
        if (
          offset >= resp.total_investment_transactions ||
          resp.investment_transactions.length === 0
        ) {
          break;
        }
      }
      return all;
    },
  };
}

export function mapPlaidInvestmentKind(type: string, subtype: string): InvestmentActivityKind {
  const sub = subtype.toLowerCase();
  const ty = type.toLowerCase();
  if (sub === "contribution" || sub === "deposit") return "contribution";
  if (sub === "dividend" || sub === "qualified dividend" || sub === "non-qualified dividend") {
    return "dividend";
  }
  if (sub === "interest" || sub === "interest receivable") return "interest";
  if (ty === "buy") return "buy";
  if (ty === "sell") return "sell";
  return "other";
}

function mapActivity(
  t: PlaidInvestmentTransaction,
  securities: Map<string, PlaidSecurity>,
): ProviderInvestmentActivity {
  const security = t.security_id === null ? undefined : securities.get(t.security_id);
  const ticker = security?.ticker_symbol ?? undefined;
  return {
    externalAccountId: t.account_id,
    sourceActivityId: t.investment_transaction_id,
    date: isoDate(t.date),
    description: t.name,
    kind: mapPlaidInvestmentKind(t.type, t.subtype),
    // Sign flip: Plaid positive = cash out of the account -> platform positive = cash in.
    amountMinor: -dollarsToMinor(t.amount),
    ...(ticker === undefined ? {} : { ticker }),
    ...(t.quantity === null || t.quantity === 0 ? {} : { quantity: String(t.quantity) }),
  };
}

interface PlaidSecurity {
  security_id: string;
  ticker_symbol: string | null;
}

interface PlaidInvestmentTransaction {
  investment_transaction_id: string;
  account_id: string;
  security_id: string | null;
  date: string;
  name: string;
  type: string;
  subtype: string;
  amount: number;
  quantity: number | null;
}

interface PlaidInvestmentsResponse {
  investment_transactions: PlaidInvestmentTransaction[];
  securities?: PlaidSecurity[];
  total_investment_transactions: number;
}
