import type { PlatformDb } from "@platform/database";
import type { UserId } from "@platform/financial-core";
import type { FinancialState } from "@platform/insight-engine";
import {
  createAccountRepository,
  createBudgetRepository,
  createGoalRepository,
  createInvestmentActivityRepository,
  createSnapshotRepository,
  createTransactionRepository,
} from "./repositories.js";

/** Assembles everything the insight engine reads, in one round of queries. */
export async function loadFinancialState(db: PlatformDb, userId: UserId): Promise<FinancialState> {
  const [accounts, transactions, budgets, goals, snapshots, investmentActivity] = await Promise.all(
    [
      createAccountRepository(db).listActive(userId),
      createTransactionRepository(db).findByUser(userId),
      createBudgetRepository(db).listActive(userId),
      createGoalRepository(db).listActive(userId),
      createSnapshotRepository(db).listByUser(userId),
      createInvestmentActivityRepository(db).findByUser(userId),
    ],
  );
  return { userId, accounts, transactions, budgets, goals, snapshots, investmentActivity };
}
