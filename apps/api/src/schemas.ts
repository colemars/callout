import { z } from "zod";

/**
 * API-boundary schemas. Zod lives here, not in financial-core (the domain has
 * zero runtime deps). The serializer validates AND strips: fields not listed
 * (userId, vault ids, connection internals) never leave the API.
 */

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
});

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  institution: z.string(),
  kind: z.enum(["depository", "credit", "loan", "investment", "other"]),
  subtype: z.string().optional(),
  mask: z.string().optional(),
  balance: moneySchema,
  creditLimit: moneySchema.optional(),
  balanceAsOf: z.string().optional(),
  isActive: z.boolean(),
  /** Bank-reported liability facts (Plaid Liabilities), when consented. */
  apr: z.number().optional(),
  aprType: z.string().optional(),
  minPayment: moneySchema.optional(),
  nextDueDate: z.string().optional(),
  isOverdue: z.boolean().optional(),
});

export const transactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  postedAt: z.string(),
  authorizedAt: z.string().optional(),
  description: z.string(),
  merchant: z.string().optional(),
  amount: moneySchema,
  pending: z.boolean(),
  category: z.string(),
  /** Who decided the category: rule (regex/table) | ai (scribe) | user (correction). */
  categorySource: z.enum(["rule", "ai", "user"]),
  source: z.string(),
});

export const goalSchema = z.object({
  id: z.string(),
  kind: z.enum(["savings_net_flow", "balance_target", "debt_paydown"]),
  accountId: z.string().optional(),
  targetAmount: moneySchema,
  targetDate: z.string().optional(),
  startedAt: z.string().optional(),
  baselineAmount: moneySchema.optional(),
  note: z.string().optional(),
  active: z.boolean(),
});

export const budgetSchema = z.object({
  category: z.string(),
  monthlyCap: moneySchema,
  active: z.boolean(),
});

export const eventSchema = z.object({
  id: z.string(),
  /** Monotonic insertion cursor — paginate with ?sinceSeq= (exact, loss-free). */
  seq: z.number().int(),
  type: z.string(),
  /** The date the event describes. */
  occurredOn: z.string(),
  /** When the event was derived. */
  createdAt: z.string(),
  payload: z.record(z.unknown()),
});

export const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Preferred cursor: events with seq strictly greater, ascending. */
  sinceSeq: z.coerce.number().int().min(0).optional(),
  /** Legacy cursor (ISO timestamp) — batch-boundary-lossy; prefer sinceSeq. */
  since: z.string().datetime().optional(),
});

export const historyQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const snapshotSchema = z.object({
  asOf: z.string(),
  metrics: z.record(z.unknown()),
});

export const dateRangeQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const limitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const investmentActivitySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  kind: z.enum(["contribution", "dividend", "interest", "buy", "sell", "other"]),
  /** Positive = cash into the account. */
  amount: moneySchema,
  ticker: z.string().optional(),
  quantity: z.string().optional(),
});

export const errorSchema = z.object({
  error: z.string(),
});

export const syncReportSchema = z.object({
  institution: z.string(),
  status: z.enum(["ok", "login_required", "error"]),
  added: z.number(),
  modified: z.number(),
  removed: z.number(),
  investments: z.enum(["ok", "unsupported", "error"]).optional(),
  investmentActivityCount: z.number().optional(),
  liabilities: z.enum(["ok", "unsupported", "error"]).optional(),
  liabilityCount: z.number().optional(),
  message: z.string().optional(),
});

export const scribeReportSchema = z.object({
  status: z.enum(["ok", "skipped", "error"]),
  examined: z.number(),
  updated: z.number(),
  rulesLearned: z.number(),
  unresolved: z.number(),
  message: z.string().optional(),
});

export const syncRunSchema = z.object({
  reports: z.array(syncReportSchema),
  newEvents: z.number(),
  /** Present only when the AI scribe is configured. */
  scribe: scribeReportSchema.optional(),
});

/**
 * Products with server-held state; extend as products gain a server side.
 * "kingdom" is churny (last-seen baseline; writers ignore 409s);
 * "kingdom-meta" is precious (epoch, endowment, spends) — writers CAS-retry.
 */
export const productParams = z.object({ product: z.enum(["kingdom", "kingdom-meta"]) });

export const productStateSchema = z.object({
  product: z.string(),
  version: z.number().int(),
  data: z.record(z.unknown()),
});

export const putStateBody = z
  .object({
    data: z.record(z.unknown()),
    baseVersion: z.number().int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (JSON.stringify(v.data).length > 64 * 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "data exceeds 64KB" });
    }
  });

export const putStateResultSchema = z.object({ version: z.number().int() });

export const transactionIdParams = z.object({ id: z.string().uuid() });

export const patchTransactionBody = z.object({
  category: z.enum([
    "groceries",
    "dining",
    "delivery",
    "coffee",
    "transport",
    "shopping",
    "subscriptions",
    "entertainment",
    "travel",
    "health",
    "housing",
    "debt_payment",
    "income",
    "transfer",
    "other",
  ]),
});

const CATEGORY_ENUM = z.enum([
  "groceries",
  "dining",
  "delivery",
  "coffee",
  "transport",
  "shopping",
  "subscriptions",
  "entertainment",
  "travel",
  "health",
  "housing",
  "debt_payment",
  "income",
  "transfer",
  "other",
]);

export const budgetCategoryParams = z.object({ category: CATEGORY_ENUM });

export const putBudgetBody = z.object({
  /** Positive minor units — a decree of $0 is a repeal, use DELETE. */
  monthlyCapMinor: z.number().int().min(1),
});

export const goalIdParams = z.object({ id: z.string().uuid() });

export const createGoalBody = z
  .object({
    kind: z.enum(["savings_net_flow", "balance_target", "debt_paydown"]),
    /** For paydown this is the balance to reach — 0 means "pay it off". */
    targetAmountMinor: z.number().int().min(0),
    /** Required: the engine only paces goals with a deadline. */
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().uuid().optional(),
    note: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === "balance_target" || v.kind === "debt_paydown") && v.accountId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.kind} requires accountId` });
    }
    // Farming floor for accumulation goals; paydown's floor is the route's
    // target-below-balance check (0 is the noblest paydown target of all).
    if (v.kind !== "debt_paydown" && v.targetAmountMinor < 100_00) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "target must be at least $100" });
    }
  });

export const patchGoalBody = z.object({
  targetAmountMinor: z.number().int().min(0).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

/**
 * Data rights (ARCHITECTURE.md "Security, Privacy & Trust"): the full
 * archive of everything the platform holds for the caller. Secret ids and
 * vault internals never appear — connection rows are reduced to metadata.
 */
export const exportSchema = z.object({
  exportedAt: z.string(),
  accounts: z.array(accountSchema),
  transactions: z.array(transactionSchema),
  budgets: z.array(budgetSchema),
  goals: z.array(goalSchema),
  investmentActivity: z.array(investmentActivitySchema),
  balanceSnapshots: z.array(
    z.object({
      accountId: z.string(),
      asOf: z.string(),
      balance: moneySchema,
    }),
  ),
  events: z.array(eventSchema),
  latestMetrics: snapshotSchema.nullable(),
  productState: z.array(productStateSchema),
  categoryRules: z.array(
    z.object({
      matchKey: z.string(),
      category: z.string(),
      origin: z.string(),
    }),
  ),
  connections: z.array(
    z.object({
      institution: z.string().nullable(),
      status: z.string(),
    }),
  ),
});

/**
 * The full wipe. The confirmation phrase is deliberate friction — this
 * deletes every platform row the caller owns and their vault-held tokens.
 * alsoRevokeAtPlaid calls Plaid /item/remove per connection: OPT-IN because
 * on the Plaid Trial plan Items are lifetime-capped and deletion does NOT
 * free slots — an accidental revoke is near-unrecoverable (relinking burns
 * new slots). Flip the default to true once on a paid Plaid plan.
 */
export const deleteDataBody = z.object({
  confirm: z.literal("BURN THE LEDGERS"),
  alsoRevokeAtPlaid: z.boolean().default(false),
});

export const wipeReportSchema = z.object({
  deleted: z.record(z.number().int()),
  tokensDeleted: z.number().int(),
  /** Vault secret ids that could not be deleted — non-empty means follow up. */
  orphanedTokens: z.array(z.string()),
  revokedAtPlaid: z.number().int(),
});
