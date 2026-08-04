import type { Brand } from "../brand.js";
import type { ISODate } from "../dates/local-date.js";
import type { AccountId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

export type InvestmentActivityId = Brand<string, "InvestmentActivityId">;

export const investmentActivityId = (v: string): InvestmentActivityId => {
  if (v.length === 0) throw new TypeError("InvestmentActivityId must not be empty");
  return v as InvestmentActivityId;
};

export type InvestmentActivityKind =
  | "contribution"
  | "dividend"
  | "interest"
  | "buy"
  | "sell"
  | "other";

/**
 * Explicit activity inside an investment account (Plaid Investments product).
 * The record that makes contributions VERIFIABLE behavior — balance deltas
 * never are (a market rally is not a contribution).
 */
export interface InvestmentActivity {
  readonly id: InvestmentActivityId;
  readonly userId: UserId;
  readonly accountId: AccountId;
  readonly source: "plaid";
  readonly sourceActivityId: string;
  readonly date: ISODate;
  readonly description: string;
  readonly kind: InvestmentActivityKind;
  /** Platform convention: POSITIVE = cash into the account (contribution, dividend). */
  readonly amount: Money;
  readonly ticker?: string;
  /** Share quantity as text — share counts are not money. */
  readonly quantity?: string;
}
