import type { PlatformDb } from "@platform/database";
import { sql } from "drizzle-orm";
import { platformUser } from "../env.js";

export interface BackfillResult {
  readonly accounts: number;
  readonly transactions: number;
  readonly snapshots: number;
  readonly reconciliation: {
    readonly legacyTxnCount: number;
    readonly platformTxnCount: number;
    /** Legacy sum is positive=outflow dollars; platform sum is negative=outflow minor. They must cancel. */
    readonly legacySumDollars: string;
    readonly platformSumMinor: string;
  };
}

/**
 * Copies legacy public.* rows into platform.* — string-free of floats:
 * numeric dollars are converted with round(x * 100)::bigint in SQL, and the
 * sign convention flips (legacy positive = outflow -> platform negative).
 * Idempotent: conflicts are skipped.
 */
export async function runBackfill(db: PlatformDb): Promise<BackfillResult> {
  const user = platformUser();

  const accounts = await rowsOf(
    db.execute(sql`
      insert into platform.accounts
        (user_id, source, external_id, name, institution, kind, subtype, mask,
         balance_minor, credit_limit_minor, balance_as_of, is_active)
      select ${user}::uuid, a.source, coalesce(a.plaid_account_id, 'legacy-' || a.id::text),
             a.name, a.institution, a.type, a.subtype, a.mask,
             coalesce(round(a.current_balance * 100)::bigint, 0),
             round(a.credit_limit * 100)::bigint,
             a.balance_updated_at::date, a.is_active
      from public.accounts a
      on conflict do nothing
      returning id
    `),
  );

  const transactions = await rowsOf(
    db.execute(sql`
      insert into platform.transactions
        (user_id, account_id, source, source_txn_id, posted_at, authorized_at,
         description, merchant, amount_minor, pending, category, source_category)
      select ${user}::uuid, pa.id, t.source, t.source_txn_id, t.posted_at, t.authorized_at,
             t.name, t.merchant, -round(t.amount * 100)::bigint, t.pending, t.category, t.source_category
      from public.transactions t
      join public.accounts la on la.id = t.account_id
      join platform.accounts pa
        on pa.user_id = ${user}::uuid
       and pa.source = la.source
       and pa.external_id = coalesce(la.plaid_account_id, 'legacy-' || la.id::text)
      on conflict do nothing
      returning id
    `),
  );

  const snapshots = await rowsOf(
    db.execute(sql`
      insert into platform.balance_snapshots (user_id, account_id, as_of, balance_minor)
      select ${user}::uuid, pa.id, s.as_of, round(s.current_balance * 100)::bigint
      from public.balance_snapshots s
      join public.accounts la on la.id = s.account_id
      join platform.accounts pa
        on pa.user_id = ${user}::uuid
       and pa.source = la.source
       and pa.external_id = coalesce(la.plaid_account_id, 'legacy-' || la.id::text)
      on conflict do nothing
      returning account_id
    `),
  );

  const recon = await rowsOf(
    db.execute(sql`
      select
        (select count(*) from public.transactions) as legacy_txn_count,
        (select count(*) from platform.transactions where user_id = ${user}::uuid) as platform_txn_count,
        (select coalesce(sum(amount), 0)::text from public.transactions) as legacy_sum_dollars,
        (select coalesce(sum(amount_minor), 0)::text from platform.transactions where user_id = ${user}::uuid) as platform_sum_minor
    `),
  );
  const r = recon[0] as
    | {
        legacy_txn_count: string | number;
        platform_txn_count: string | number;
        legacy_sum_dollars: string;
        platform_sum_minor: string;
      }
    | undefined;

  return {
    accounts: accounts.length,
    transactions: transactions.length,
    snapshots: snapshots.length,
    reconciliation: {
      legacyTxnCount: Number(r?.legacy_txn_count ?? 0),
      platformTxnCount: Number(r?.platform_txn_count ?? 0),
      legacySumDollars: r?.legacy_sum_dollars ?? "0",
      platformSumMinor: r?.platform_sum_minor ?? "0",
    },
  };
}

async function rowsOf(promise: Promise<unknown>): Promise<unknown[]> {
  const result = await promise;
  return Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
}
