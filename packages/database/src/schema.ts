import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The platform's Drizzle-owned schema. Lives in the `platform` Postgres schema
 * of the same Supabase project as the legacy callout tables (`public.*`) —
 * zero collision, parallel operation until cutover.
 *
 * Conventions:
 * - Monetary values are `*_minor` bigint columns: integer minor units, SIGNED,
 *   negative = outflow (the platform convention; adapters flip Plaid's sign).
 * - Every user-scoped table has user_id; composite indexes lead with it.
 * - FKs to auth.users + RLS policies live in supabase/rls_policies.sql
 *   (Supabase-specific, applied separately so migrations stay portable).
 */
export const platform = pgSchema("platform");

export const providerConnections = platform.table(
  "provider_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(), // 'plaid'
    externalItemId: text("external_item_id").notNull(),
    institutionName: text("institution_name"),
    /** Supabase Vault secret id — shared with the legacy stack via get_plaid_token(). */
    accessTokenSecretId: uuid("access_token_secret_id").notNull(),
    /** Sync cursor. Starts NULL (full replay = backfill); never copied from public.plaid_items. */
    cursor: text("cursor"),
    status: text("status").notNull().default("ok"), // ok | login_required | error
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("provider_connections_user_item_ux").on(t.userId, t.provider, t.externalItemId),
  ],
);

export const accounts = platform.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    source: text("source").notNull(), // plaid | apple_csv | csv | manual
    externalId: text("external_id"),
    connectionId: uuid("connection_id").references(() => providerConnections.id),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    kind: text("kind").notNull(), // depository | credit | loan | investment
    subtype: text("subtype"),
    mask: text("mask"),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    creditLimitMinor: bigint("credit_limit_minor", { mode: "number" }),
    balanceAsOf: date("balance_as_of", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("accounts_user_ix").on(t.userId),
    uniqueIndex("accounts_user_source_external_ux")
      .on(t.userId, t.source, t.externalId)
      .where(sql`external_id is not null`),
  ],
);

export const transactions = platform.table(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    source: text("source").notNull(),
    sourceTxnId: text("source_txn_id").notNull(),
    postedAt: date("posted_at", { mode: "string" }).notNull(),
    authorizedAt: date("authorized_at", { mode: "string" }),
    description: text("description").notNull(),
    merchant: text("merchant"),
    /** SIGNED minor units: negative = outflow. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    pending: boolean("pending").notNull().default(false),
    category: text("category").notNull().default("other"),
    /** Who decided the category: 'rule' (regex/table) | 'ai' (scribe) | 'user' (override — law). */
    categorySource: text("category_source").notNull().default("rule"),
    sourceCategory: text("source_category"),
  },
  (t) => [
    uniqueIndex("transactions_user_source_txn_ux").on(t.userId, t.source, t.sourceTxnId),
    index("transactions_user_posted_ix").on(t.userId, t.postedAt),
    index("transactions_user_category_posted_ix").on(t.userId, t.category, t.postedAt),
  ],
);

export const goals = platform.table(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(), // savings_net_flow | balance_target | debt_paydown
    accountId: uuid("account_id").references(() => accounts.id),
    targetAmountMinor: bigint("target_amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    targetDate: date("target_date", { mode: "string" }),
    startedAt: date("started_at", { mode: "string" }),
    baselineAmountMinor: bigint("baseline_amount_minor", { mode: "number" }),
    note: text("note"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("goals_user_ix").on(t.userId)],
);

export const budgets = platform.table(
  "budgets",
  {
    userId: uuid("user_id").notNull(),
    category: text("category").notNull(),
    monthlyCapMinor: bigint("monthly_cap_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

export const balanceSnapshots = platform.table(
  "balance_snapshots",
  {
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    asOf: date("as_of", { mode: "string" }).notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.asOf] }),
    index("balance_snapshots_user_ix").on(t.userId),
  ],
);

/** Explicit activity inside investment accounts (Plaid Investments product). */
export const investmentActivity = platform.table(
  "investment_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    source: text("source").notNull(), // 'plaid'
    sourceActivityId: text("source_activity_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    kind: text("kind").notNull(), // contribution | dividend | interest | buy | sell | other
    /** SIGNED minor units: positive = cash into the account. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    securityTicker: text("security_ticker"),
    /** Share quantity as text — share counts are not money. */
    quantity: text("quantity"),
  },
  (t) => [
    uniqueIndex("investment_activity_user_source_ux").on(t.userId, t.source, t.sourceActivityId),
    index("investment_activity_user_date_ix").on(t.userId, t.date),
  ],
);

/** Global provider-category → platform-category rules (ported from public.category_map). */
export const categoryRules = platform.table(
  "category_rules",
  {
    source: text("source").notNull(),
    sourceCategory: text("source_category").notNull(),
    category: text("category").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.sourceCategory] })],
);

/** One persisted MetricSet per user per day — the input to deriveEvents. */
export const metricSnapshots = platform.table(
  "metric_snapshots",
  {
    userId: uuid("user_id").notNull(),
    asOf: date("as_of", { mode: "string" }).notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.asOf] })],
);

export const events = platform.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_user_created_ix").on(t.userId, t.createdAt)],
);

/**
 * Per-user, per-product opaque state (kingdom last-seen, future Influence
 * ledger, entitlements…). The blob keeps product-specific shapes out of the
 * platform schema; `version` is an optimistic-concurrency counter.
 */
export const productState = platform.table(
  "product_state",
  {
    userId: uuid("user_id").notNull(),
    product: text("product").notNull(),
    version: integer("version").notNull().default(1),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.product] })],
);

/**
 * Per-user learned categorization rules. origin 'user' rows are law (a
 * correction the user made); origin 'ai' rows are the scribe's memory so each
 * novel merchant is classified once. AI never overwrites a user row.
 */
export const userCategoryRules = platform.table(
  "user_category_rules",
  {
    userId: uuid("user_id").notNull(),
    source: text("source").notNull(),
    matchKey: text("match_key").notNull(),
    category: text("category").notNull(),
    origin: text("origin").notNull(), // 'ai' | 'user'
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.matchKey] })],
);
