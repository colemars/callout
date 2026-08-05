import type { ISODate } from "../dates/local-date.js";
import type { AccountId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

export type LiabilityKind = "credit" | "student" | "mortgage";

/**
 * The bank-reported cost of a debt account (Plaid Liabilities): APR, minimum
 * payment, due date. One snapshot per account, refreshed each sync. Rates are
 * basis points (29.99% -> 2999) — a rate is not money.
 */
export interface AccountLiability {
  readonly accountId: AccountId;
  readonly userId: UserId;
  readonly kind: LiabilityKind;
  readonly aprBps?: number;
  readonly aprType?: string;
  readonly minPayment?: Money;
  readonly nextDueDate?: ISODate;
  readonly isOverdue?: boolean;
  readonly lastPayment?: Money;
}
