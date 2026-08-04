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
  type: z.string(),
  /** The date the event describes. */
  occurredOn: z.string(),
  /** When the event was derived — cursor on THIS with ?since=. */
  createdAt: z.string(),
  payload: z.record(z.unknown()),
});

export const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** ISO timestamp; returns events created strictly after it, ascending. */
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
  message: z.string().optional(),
});

export const syncRunSchema = z.object({
  reports: z.array(syncReportSchema),
  newEvents: z.number(),
});
