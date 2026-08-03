import type { ISODate } from "../dates/local-date.js";
import type { AccountId, ConnectionId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

export type AccountKind = "depository" | "credit" | "loan" | "investment";

export type AccountSource = "plaid" | "apple_csv" | "csv" | "manual";

export interface Account {
  readonly id: AccountId;
  readonly userId: UserId;
  readonly source: AccountSource;
  /** Provider's identifier (e.g. Plaid account_id); undefined for manual accounts. */
  readonly externalId?: string;
  readonly connectionId?: ConnectionId;
  readonly name: string;
  readonly institution: string;
  readonly kind: AccountKind;
  readonly subtype?: string;
  readonly mask?: string;
  readonly balance: Money;
  readonly creditLimit?: Money;
  readonly balanceAsOf?: ISODate;
  readonly isActive: boolean;
}

/** Debt accounts: balance represents what is owed. */
export function isDebtAccount(a: Account): boolean {
  return a.kind === "credit" || a.kind === "loan";
}
