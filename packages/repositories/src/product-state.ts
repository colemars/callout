import type { PlatformDb } from "@platform/database";
import { productState } from "@platform/database";
import type { UserId } from "@platform/financial-core";
import { and, eq, sql } from "drizzle-orm";

export interface ProductStateRecord {
  readonly product: string;
  readonly version: number;
  readonly data: unknown;
}

/**
 * Per-user, per-product opaque state. `put` with a baseVersion is a CAS
 * (compare-and-swap) — "conflict" means another writer advanced the version;
 * without one it's an unconditional create-or-overwrite (last write wins).
 */
export interface ProductStateStore {
  get(userId: UserId, product: string): Promise<ProductStateRecord | null>;
  put(
    userId: UserId,
    product: string,
    data: unknown,
    baseVersion?: number,
  ): Promise<{ version: number } | "conflict">;
}

export function createProductStateStore(db: PlatformDb): ProductStateStore {
  return {
    async get(userId, product) {
      const rows = await db
        .select()
        .from(productState)
        .where(and(eq(productState.userId, userId), eq(productState.product, product)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return { product: row.product, version: row.version, data: row.data };
    },

    async put(userId, product, data, baseVersion) {
      if (baseVersion !== undefined) {
        const rows = await db
          .update(productState)
          .set({ data, version: sql`${productState.version} + 1`, updatedAt: new Date() })
          .where(
            and(
              eq(productState.userId, userId),
              eq(productState.product, product),
              eq(productState.version, baseVersion),
            ),
          )
          .returning({ version: productState.version });
        const row = rows[0];
        return row === undefined ? "conflict" : { version: row.version };
      }
      const rows = await db
        .insert(productState)
        .values({ userId, product, data, version: 1 })
        .onConflictDoUpdate({
          target: [productState.userId, productState.product],
          set: {
            data,
            version: sql`${productState.version} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ version: productState.version });
      // biome-ignore lint/style/noNonNullAssertion: insert..returning always yields one row
      return { version: rows[0]!.version };
    },
  };
}
