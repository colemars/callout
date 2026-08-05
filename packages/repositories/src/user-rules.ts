import type { PlatformDb } from "@platform/database";
import { userCategoryRules } from "@platform/database";
import type { Category, UserId } from "@platform/financial-core";
import { isCategory } from "@platform/financial-core";
import { and, eq, sql } from "drizzle-orm";

export interface UserRuleEntry {
  readonly category: Category;
  readonly origin: "ai" | "user";
}

/**
 * Per-user learned categorization rules keyed by (source, matchKey).
 * 'user' rows are corrections (law); 'ai' rows are the scribe's memory.
 * The upsert enforces "ai never overwrites user" in SQL.
 */
export interface UserCategoryRuleStore {
  listForUser(userId: UserId, source: string): Promise<Map<string, UserRuleEntry>>;
  /** Every rule across ALL sources — for the data-rights export. */
  listAllForUser(
    userId: UserId,
  ): Promise<Array<{ source: string; matchKey: string; category: string; origin: string }>>;
  upsert(
    userId: UserId,
    source: string,
    matchKey: string,
    category: Category,
    origin: "ai" | "user",
  ): Promise<void>;
}

export function createUserCategoryRuleStore(db: PlatformDb): UserCategoryRuleStore {
  return {
    async listForUser(userId, source) {
      const rows = await db
        .select()
        .from(userCategoryRules)
        .where(and(eq(userCategoryRules.userId, userId), eq(userCategoryRules.source, source)));
      const map = new Map<string, UserRuleEntry>();
      for (const row of rows) {
        if (!isCategory(row.category)) continue;
        if (row.origin !== "ai" && row.origin !== "user") continue;
        map.set(row.matchKey, { category: row.category, origin: row.origin });
      }
      return map;
    },

    async listAllForUser(userId) {
      const rows = await db
        .select()
        .from(userCategoryRules)
        .where(eq(userCategoryRules.userId, userId));
      return rows.map((r) => ({
        source: r.source,
        matchKey: r.matchKey,
        category: r.category,
        origin: r.origin,
      }));
    },

    async upsert(userId, source, matchKey, category, origin) {
      const target = [
        userCategoryRules.userId,
        userCategoryRules.source,
        userCategoryRules.matchKey,
      ];
      const set = { category, origin, updatedAt: new Date() };
      await db
        .insert(userCategoryRules)
        .values({ userId, source, matchKey, category, origin })
        .onConflictDoUpdate(
          origin === "user"
            ? { target, set } // a correction overwrites anything
            : // the scribe may refine its own memory; never a user's correction
              { target, set, setWhere: sql`${userCategoryRules.origin} <> 'user'` },
        );
    },
  };
}
