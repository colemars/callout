import type { Account, BalanceSnapshot, ISODate, Money } from "@platform/financial-core";
import { addDays, compareDates, isDebtAccount, subtract, sumOf } from "@platform/financial-core";
import type { EngineConfig } from "../config.js";
import type { DebtTrajectoryEntry } from "../metrics.js";

function latestOnOrBefore(
  snapshots: readonly BalanceSnapshot[],
  accountId: Account["id"],
  cutoff: ISODate,
): BalanceSnapshot | null {
  let best: BalanceSnapshot | null = null;
  for (const s of snapshots) {
    if (s.accountId !== accountId) continue;
    if (compareDates(s.asOf, cutoff) === 1) continue;
    if (best === null || compareDates(s.asOf, best.asOf) === 1) best = s;
  }
  return best;
}

/** Ported from v_debt_trajectory: 30/60/90-day balance deltas for credit + loan accounts. */
export function computeDebtTrajectory(
  accounts: readonly Account[],
  snapshots: readonly BalanceSnapshot[],
  asOf: ISODate,
): DebtTrajectoryEntry[] {
  return accounts
    .filter((a) => a.isActive && isDebtAccount(a))
    .map((a) => {
      const delta = (days: number): Money | null => {
        const snap = latestOnOrBefore(snapshots, a.id, addDays(asOf, -days));
        return snap === null ? null : subtract(a.balance, snap.balance);
      };
      return {
        accountId: a.id,
        name: a.name,
        institution: a.institution,
        kind: a.kind,
        currentBalance: a.balance,
        delta30d: delta(30),
        delta60d: delta(60),
        delta90d: delta(90),
      };
    })
    .sort((x, y) => x.accountId.localeCompare(y.accountId));
}

/** Sum of balances across active accounts of the configured high-interest kinds. */
export function totalHighInterestDebt(accounts: readonly Account[], config: EngineConfig): Money {
  return sumOf(
    accounts
      .filter((a) => a.isActive && (config.highInterestKinds as readonly string[]).includes(a.kind))
      .map((a) => a.balance),
    config.currency,
  );
}
