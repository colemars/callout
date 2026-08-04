import type { ISODate } from "../dates/local-date.js";
import type { AccountId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";
import type { Category } from "./category.js";

export interface User {
  readonly id: UserId;
  readonly email: string;
}

/** A monthly spending cap for one category. */
export interface Budget {
  readonly userId: UserId;
  readonly category: Category;
  readonly monthlyCap: Money;
  readonly active: boolean;
}

export interface RecurringExpense {
  readonly userId: UserId;
  readonly merchant: string;
  readonly averageAmount: Money;
  readonly firstSeen: ISODate;
  readonly lastSeen: ISODate;
  readonly averageGapDays: number;
  readonly status: "active" | "maybe_dead" | "acknowledged";
}

export interface BalanceSnapshot {
  readonly userId: UserId;
  readonly accountId: AccountId;
  readonly asOf: ISODate;
  readonly balance: Money;
}

/** A named, dated, explainable number produced by the insight engine. */
export interface Metric {
  readonly key: string;
  readonly asOf: ISODate;
  readonly value: number | Money;
}
