import type { ISODate, ISOMonth } from "../dates/local-date.js";
import type { Category } from "../entities/category.js";
import type { GoalId, UserId } from "../ids.js";
import type { Money } from "../money/money.js";

/**
 * The platform's normalized event vocabulary (ARCHITECTURE.md "Financial Events").
 * Every payload carries the numbers needed to EXPLAIN the event so products can
 * translate without re-deriving anything.
 */
interface EventBase {
  readonly userId: UserId;
  readonly occurredOn: ISODate;
}

export type FinancialEvent = EventBase &
  (
    | {
        readonly type: "GOAL_OFF_TRACK";
        readonly goalId: GoalId;
        readonly expected: Money;
        readonly actual: Money;
        readonly shortfall: Money;
      }
    | {
        readonly type: "GOAL_ON_TRACK";
        readonly goalId: GoalId;
        readonly surplus: Money;
      }
    | {
        readonly type: "MONTHLY_SPENDING_INCREASED";
        readonly category: Category | "total";
        readonly month: ISOMonth;
        readonly previous: Money;
        readonly current: Money;
        readonly deltaPct: number;
      }
    | {
        readonly type: "MONTHLY_SPENDING_DECREASED";
        readonly category: Category | "total";
        readonly month: ISOMonth;
        readonly previous: Money;
        readonly current: Money;
        readonly deltaPct: number;
      }
    | {
        readonly type: "RECURRING_EXPENSE_ADDED";
        readonly merchant: string;
        readonly estimatedMonthly: Money;
      }
    | {
        readonly type: "RECURRING_EXPENSE_REMOVED";
        readonly merchant: string;
        readonly lastSeen: ISODate;
      }
    | {
        readonly type: "HIGH_INTEREST_DEBT_INCREASED";
        readonly previous: Money;
        readonly current: Money;
        readonly delta: Money;
        /** The set of linked accounts changed between snapshots — the delta may reflect linking/unlinking, not behavior. Folds must ignore flagged events. */
        readonly accountSetChanged?: true;
      }
    | {
        readonly type: "HIGH_INTEREST_DEBT_DECREASED";
        readonly previous: Money;
        readonly current: Money;
        readonly delta: Money;
        readonly accountSetChanged?: true;
      }
    | {
        /** The last of the high-interest debt is gone. */
        readonly type: "DEBT_ELIMINATED";
        readonly previous: Money;
      }
    | {
        readonly type: "NET_CASH_FLOW_NEGATIVE";
        readonly month: ISOMonth;
        readonly netFlow: Money;
      }
    | {
        readonly type: "NET_CASH_FLOW_POSITIVE";
        readonly month: ISOMonth;
        readonly netFlow: Money;
      }
    | {
        readonly type: "PASSIVE_INCOME_INCREASED";
        readonly previous: Money;
        readonly current: Money;
      }
    | {
        readonly type: "RETIREMENT_CONTRIBUTION_MADE";
        readonly month: ISOMonth;
        readonly amount: Money;
      }
    | {
        readonly type: "RETIREMENT_CONTRIBUTION_INCREASED";
        readonly previousMonth: ISOMonth;
        readonly month: ISOMonth;
        readonly previous: Money;
        readonly current: Money;
      }
    | {
        readonly type: "UNCATEGORIZED_FUNDS";
        readonly month: ISOMonth;
        readonly count: number;
        /** Magnitude of the month's net uncategorized flow. */
        readonly amount: Money;
      }
    | {
        readonly type: "EMERGENCY_RUNWAY_CHANGED";
        readonly previousMonths: number;
        readonly currentMonths: number;
        readonly accountSetChanged?: true;
      }
    | {
        /** Emergency runway crossed a tier upward (1, 3, 6, or 12 months). */
        readonly type: "EMERGENCY_FUND_MILESTONE";
        readonly tier: number;
        readonly month: ISOMonth;
      }
    | {
        /** Trailing savings rate crossed a tier upward (5, 10, 20, or 30%). */
        readonly type: "SAVINGS_RATE_MILESTONE";
        readonly tierPct: number;
        readonly month: ISOMonth;
      }
    | {
        /** Every active budget held for `months` consecutive completed months. */
        readonly type: "UNDER_BUDGET_STREAK";
        readonly months: number;
        readonly month: ISOMonth;
      }
    | {
        /** A goal's actual reached its target. */
        readonly type: "GOAL_COMPLETED";
        readonly goalId: GoalId;
        readonly kind: "savings_net_flow" | "balance_target" | "debt_paydown";
        readonly target: Money;
      }
  );

export type FinancialEventType = FinancialEvent["type"];

/** Compile-time exhaustiveness guard for switches over FinancialEvent. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
