import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Driver-agnostic database handle: production uses postgres-js against the
 * Supabase pooler; tests use PGlite. Repositories accept this type.
 */
export type PlatformDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Pool size. Use 1 per Lambda container; default 10 elsewhere. */
  readonly max?: number;
}

export function createDb(connectionString: string, options?: CreateDbOptions): PlatformDb {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
    // Supabase's transaction-mode pooler does not support prepared statements.
    prepare: false,
    // Close idle sockets promptly — keeps Lambda containers and the pooler tidy.
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}
