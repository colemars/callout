import type { AccountKind, ISODate } from "@platform/financial-core";
import { isoDate } from "@platform/financial-core";
import type {
  ProviderAccount,
  ProviderTransaction,
  SyncPage,
  TransactionProvider,
} from "../types.js";
import type { PlaidHttp } from "./client.js";

/**
 * Plaid provider. THE sign flip lives here and nowhere else:
 * Plaid reports positive = outflow; the platform stores negative = outflow.
 * Plaid reports decimal dollars; the platform stores integer minor units.
 */
export function createPlaidProvider(client: PlaidHttp): TransactionProvider {
  return {
    source: "plaid",

    async fetchAccounts(accessToken) {
      const resp = (await client.post("/accounts/get", {
        access_token: accessToken,
      })) as unknown as { accounts: PlaidAccount[] };
      return resp.accounts.map(mapAccount);
    },

    async syncPage(accessToken, cursor) {
      const resp = (await client.post("/transactions/sync", {
        access_token: accessToken,
        ...(cursor === null ? {} : { cursor }),
        count: 500,
      })) as unknown as PlaidSyncResponse;
      return {
        added: resp.added.map(mapTransaction),
        modified: resp.modified.map(mapTransaction),
        removedSourceTxnIds: resp.removed.map((r) => r.transaction_id),
        nextCursor: resp.next_cursor ?? null,
        hasMore: resp.has_more,
      } satisfies SyncPage;
    },
  };
}

/** Decimal dollars (Plaid, 2dp) -> integer minor units. */
export function dollarsToMinor(dollars: number): number {
  const minor = Math.round(dollars * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Amount out of range: ${dollars}`);
  }
  return minor;
}

const KINDS: readonly AccountKind[] = ["depository", "credit", "loan", "investment", "other"];

function mapAccount(a: PlaidAccount): ProviderAccount {
  return {
    externalId: a.account_id,
    name: a.name,
    kind: KINDS.includes(a.type as AccountKind) ? (a.type as AccountKind) : "other",
    ...(a.subtype === null ? {} : { subtype: a.subtype }),
    ...(a.mask === null ? {} : { mask: a.mask }),
    balanceMinor: a.balances.current === null ? null : dollarsToMinor(a.balances.current),
    creditLimitMinor: a.balances.limit === null ? null : dollarsToMinor(a.balances.limit),
  };
}

function mapTransaction(t: PlaidTransaction): ProviderTransaction {
  const authorized = t.authorized_date ?? null;
  return {
    externalAccountId: t.account_id,
    sourceTxnId: t.transaction_id,
    postedAt: isoDate(t.date),
    description: t.name,
    // Sign flip: Plaid positive = outflow -> platform negative = outflow.
    amountMinor: -dollarsToMinor(t.amount),
    pending: t.pending,
    ...(authorized === null ? {} : { authorizedAt: isoDate(authorized) as ISODate }),
    ...(t.merchant_name == null ? {} : { merchant: t.merchant_name }),
    ...(t.personal_finance_category?.detailed == null
      ? {}
      : { sourceCategoryDetailed: t.personal_finance_category.detailed }),
    ...(t.personal_finance_category?.primary == null
      ? {}
      : { sourceCategoryPrimary: t.personal_finance_category.primary }),
  };
}

interface PlaidAccount {
  account_id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  balances: { current: number | null; limit: number | null };
}

interface PlaidTransaction {
  account_id: string;
  transaction_id: string;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  amount: number;
  pending: boolean;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
}

interface PlaidSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor?: string | null;
  has_more: boolean;
}
