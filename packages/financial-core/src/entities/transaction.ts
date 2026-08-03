import type { ISODate } from "../dates/local-date.js";
import type { AccountId, TransactionId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";
import type { Category } from "./category.js";

export type TransactionSource = "plaid" | "apple_csv" | "csv" | "manual";

export interface Transaction {
  readonly id: TransactionId;
  readonly userId: UserId;
  readonly accountId: AccountId;
  readonly source: TransactionSource;
  /** Provider transaction id, or a content hash for CSV rows. Unique per (source, sourceTxnId). */
  readonly sourceTxnId: string;
  readonly postedAt: ISODate;
  readonly authorizedAt?: ISODate;
  readonly description: string;
  readonly merchant?: string;
  /** Platform sign convention: NEGATIVE = outflow, POSITIVE = inflow. */
  readonly amount: Money;
  readonly pending: boolean;
  readonly category: Category;
  /** The provider's raw category, kept for re-categorization. */
  readonly sourceCategory?: string;
}

export function isOutflow(t: Transaction): boolean {
  return t.amount.amountMinor < 0;
}

export function isInflow(t: Transaction): boolean {
  return t.amount.amountMinor > 0;
}
