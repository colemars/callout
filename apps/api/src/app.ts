import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { AuthenticatedUser, JwtVerifier } from "@platform/auth";
import { AuthError } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import type { DateRange, ISODate, UserId } from "@platform/financial-core";
import type { NewGoal } from "@platform/financial-core";
import { accountId, goalId, isoDate, money, transactionId } from "@platform/financial-core";
import { normalizeMatchKey } from "@platform/ingestion";
import {
  createAccountRepository,
  createBudgetRepository,
  createConnectionStore,
  createEventStore,
  createGoalRepository,
  createInvestmentActivityRepository,
  createLiabilityRepository,
  createMetricSnapshotStore,
  createProductStateStore,
  createTransactionRepository,
  createUserCategoryRuleStore,
  deleteAllUserData,
} from "@platform/repositories";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import {
  accountSchema,
  budgetCategoryParams,
  budgetSchema,
  createGoalBody,
  dateRangeQuery,
  deleteDataBody,
  errorSchema,
  eventSchema,
  eventsQuery,
  exportSchema,
  goalIdParams,
  goalSchema,
  historyQuery,
  investmentActivitySchema,
  patchGoalBody,
  patchTransactionBody,
  productParams,
  productStateSchema,
  putBudgetBody,
  putStateBody,
  putStateResultSchema,
  snapshotSchema,
  syncRunSchema,
  transactionIdParams,
  transactionSchema,
  wipeReportSchema,
} from "./schemas.js";
import type { UserSync } from "./sync.js";
import type { PlaidWebhook } from "./webhooks.js";

export interface AppDeps {
  readonly db: PlatformDb;
  readonly verifier: JwtVerifier;
  readonly corsOrigins?: string;
  readonly logger?: boolean;
  /** On-demand sync for the calling user; absent when Plaid creds aren't configured. */
  readonly sync?: UserSync;
  /** POST /webhooks/plaid handler; absent when Plaid creds aren't configured. */
  readonly plaidWebhook?: PlaidWebhook;
  /**
   * Revokes one Plaid item by vault secret id (calls /item/remove); absent
   * when Plaid creds aren't configured. Used only by the opt-in
   * alsoRevokeAtPlaid path of DELETE /data.
   */
  readonly revokePlaidItem?: (accessTokenSecretId: string) => Promise<void>;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
    /** Exact request bytes — Plaid webhook verification hashes them. */
    rawBody?: Buffer;
  }
}

/**
 * Pure app factory (no listening, no env reads) — used by server.ts,
 * lambda.ts, emit-openapi.ts, and tests via app.inject().
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Bearer tokens must never land in CloudWatch (ARCHITECTURE.md
    // "Security, Privacy & Trust" — access is attributable, credentials
    // are not logged).
    logger:
      deps.logger === false
        ? false
        : { redact: { paths: ["req.headers.authorization"], censor: "[redacted]" } },
    requestIdHeader: "x-request-id",
  }).withTypeProvider<ZodTypeProvider>();

  // Audit line: every response attributable to the acting user, by route
  // TEMPLATE (resource ids stay out of logs by default).
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        userId: request.user?.userId ?? "anon",
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        statusCode: reply.statusCode,
      },
      "access",
    );
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("user", null);

  // JSON parsing that keeps the exact bytes: webhook signature verification
  // hashes the raw body, and re-serialized JSON is not the same bytes.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const raw = body as Buffer;
    request.rawBody = raw;
    if (raw.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw.toString("utf8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(helmet);
  await app.register(cors, {
    origin:
      deps.corsOrigins === "*" || deps.corsOrigins === undefined
        ? true
        : deps.corsOrigins.split(","),
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: { title: "platform API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });

  app.get(
    "/health",
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    async () => ({
      ok: true,
    }),
  );

  const requireUser = async (request: FastifyRequest): Promise<UserId> => {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) {
      throw new AuthError("Missing bearer token");
    }
    const user = await deps.verifier.verify(header.slice("Bearer ".length));
    request.user = user;
    return user.userId;
  };

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AuthError) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    // Message + stack only — raw error objects can carry query text.
    request.log.error({ message: error.message, stack: error.stack }, "unhandled error");
    return reply.status(500).send({ error: "internal error" });
  });

  // Plaid webhooks: outside /api/v1 (no bearer auth — authenticity comes from
  // Plaid's signed Plaid-Verification JWT over the exact request bytes).
  if (deps.plaidWebhook !== undefined) {
    const webhook = deps.plaidWebhook;
    app.post(
      "/webhooks/plaid",
      {
        schema: {
          response: {
            200: z.object({ handled: z.string() }),
            401: errorSchema,
          },
        },
      },
      async (request, reply) => {
        const jwt = request.headers["plaid-verification"];
        const verified =
          request.rawBody !== undefined &&
          (await webhook.verify(typeof jwt === "string" ? jwt : undefined, request.rawBody));
        if (!verified) return reply.status(401).send({ error: "unverified webhook" });
        const result = await webhook.handle(request.body as Record<string, unknown>);
        request.log.info({ plaidWebhook: result.handled }, "plaid webhook");
        return result;
      },
    );
  }

  await app.register(
    async (scope) => {
      const v1 = scope.withTypeProvider<ZodTypeProvider>();
      v1.get(
        "/accounts",
        { schema: { response: { 200: z.array(accountSchema), 401: errorSchema } } },
        async (request) => {
          const userId = await requireUser(request);
          const [accounts, liabilities] = await Promise.all([
            createAccountRepository(deps.db).listActive(userId),
            createLiabilityRepository(deps.db).listForUser(userId),
          ]);
          const byAccount = new Map(liabilities.map((l) => [l.accountId, l]));
          return accounts.map((a) => {
            const l = byAccount.get(a.id);
            if (l === undefined) return a;
            return {
              ...a,
              ...(l.aprBps === undefined ? {} : { apr: l.aprBps / 100 }),
              ...(l.aprType === undefined ? {} : { aprType: l.aprType }),
              ...(l.minPayment === undefined ? {} : { minPayment: l.minPayment }),
              ...(l.nextDueDate === undefined ? {} : { nextDueDate: l.nextDueDate }),
              ...(l.isOverdue === undefined ? {} : { isOverdue: l.isOverdue }),
            };
          });
        },
      );

      v1.get(
        "/transactions",
        {
          schema: {
            querystring: dateRangeQuery,
            response: { 200: z.array(transactionSchema), 401: errorSchema },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          const range: DateRange = {
            ...(request.query.from === undefined ? {} : { from: isoDate(request.query.from) }),
            ...(request.query.to === undefined ? {} : { to: isoDate(request.query.to) }),
          };
          return createTransactionRepository(deps.db).findByUser(userId, range);
        },
      );

      v1.get(
        "/goals",
        { schema: { response: { 200: z.array(goalSchema), 401: errorSchema } } },
        async (request) => {
          const userId = await requireUser(request);
          return createGoalRepository(deps.db).listActive(userId);
        },
      );

      v1.get(
        "/budgets",
        { schema: { response: { 200: z.array(budgetSchema), 401: errorSchema } } },
        async (request) => {
          const userId = await requireUser(request);
          return createBudgetRepository(deps.db).listActive(userId);
        },
      );

      v1.put(
        "/budgets/:category",
        {
          schema: {
            params: budgetCategoryParams,
            body: putBudgetBody,
            response: { 200: budgetSchema, 400: errorSchema, 401: errorSchema },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          return createBudgetRepository(deps.db).upsert(
            userId,
            request.params.category,
            money(request.body.monthlyCapMinor),
          );
        },
      );

      v1.delete(
        "/budgets/:category",
        {
          schema: {
            params: budgetCategoryParams,
            response: {
              200: z.object({ repealed: z.boolean() }),
              401: errorSchema,
            },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          const repealed = await createBudgetRepository(deps.db).deactivate(
            userId,
            request.params.category,
          );
          return { repealed };
        },
      );

      v1.post(
        "/goals",
        {
          schema: {
            body: createGoalBody,
            response: { 200: goalSchema, 400: errorSchema, 401: errorSchema },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const body = request.body;
          const today = isoDate(new Date().toISOString().slice(0, 10));
          let baseline = money(0);
          if (body.kind === "balance_target" || body.kind === "debt_paydown") {
            // Baseline = the account's balance NOW, so pacing is honest and
            // the account is provably the caller's.
            const accounts = await createAccountRepository(deps.db).listActive(userId);
            const account = accounts.find((a) => a.id === body.accountId);
            if (account === undefined) {
              return reply.status(400).send({ error: "unknown account" });
            }
            baseline = account.balance;
            // A paydown oath must actually pay something down.
            if (body.kind === "debt_paydown" && body.targetAmountMinor >= baseline.amountMinor) {
              return reply
                .status(400)
                .send({ error: "paydown target must be below the vault's current balance" });
            }
          }
          const common = {
            targetAmount: money(body.targetAmountMinor),
            startedAt: today,
            baselineAmount: baseline,
            active: true,
            ...(body.targetDate === undefined ? {} : { targetDate: isoDate(body.targetDate) }),
            ...(body.note === undefined ? {} : { note: body.note }),
          };
          const goal: NewGoal =
            body.kind === "savings_net_flow"
              ? { kind: "savings_net_flow", ...common }
              : body.kind === "balance_target"
                ? {
                    kind: "balance_target",
                    // biome-ignore lint/style/noNonNullAssertion: schema superRefine guarantees it
                    accountId: accountId(body.accountId!),
                    ...common,
                  }
                : {
                    kind: "debt_paydown",
                    // biome-ignore lint/style/noNonNullAssertion: schema superRefine guarantees it
                    accountId: accountId(body.accountId!),
                    ...common,
                  };
          return createGoalRepository(deps.db).create(userId, goal);
        },
      );

      v1.patch(
        "/goals/:id",
        {
          schema: {
            params: goalIdParams,
            body: patchGoalBody,
            response: {
              200: goalSchema,
              400: errorSchema,
              401: errorSchema,
              404: errorSchema,
            },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const body = request.body;
          const updated = await createGoalRepository(deps.db).update(
            userId,
            goalId(request.params.id),
            {
              ...(body.targetAmountMinor === undefined
                ? {}
                : { targetAmount: money(body.targetAmountMinor) }),
              ...(body.targetDate === undefined
                ? {}
                : { targetDate: body.targetDate === null ? null : isoDate(body.targetDate) }),
              ...(body.note === undefined ? {} : { note: body.note }),
              ...(body.active === undefined ? {} : { active: body.active }),
            },
          );
          if (updated === null) return reply.status(404).send({ error: "unknown goal" });
          return updated;
        },
      );

      v1.get(
        "/insights",
        {
          schema: {
            response: {
              200: z.object({ asOf: z.string(), metrics: z.record(z.unknown()) }).nullable(),
              401: errorSchema,
            },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          const latest = await createMetricSnapshotStore(deps.db).latest(userId);
          if (latest === null) return null;
          return {
            asOf: latest.asOf as ISODate as string,
            metrics: latest as unknown as Record<string, unknown>,
          };
        },
      );

      v1.get(
        "/investments/activity",
        {
          schema: {
            querystring: dateRangeQuery,
            response: { 200: z.array(investmentActivitySchema), 401: errorSchema },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          const range: DateRange = {
            ...(request.query.from === undefined ? {} : { from: isoDate(request.query.from) }),
            ...(request.query.to === undefined ? {} : { to: isoDate(request.query.to) }),
          };
          return createInvestmentActivityRepository(deps.db).findByUser(userId, range);
        },
      );

      v1.get(
        "/insights/history",
        {
          schema: {
            querystring: historyQuery,
            response: { 200: z.array(snapshotSchema), 400: errorSchema, 401: errorSchema },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const from = isoDate(request.query.from);
          const to = isoDate(request.query.to ?? new Date().toISOString().slice(0, 10));
          const rangeDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
          if (rangeDays < 0 || rangeDays > 180) {
            return reply.status(400).send({ error: "range must be 0-180 days" });
          }
          const sets = await createMetricSnapshotStore(deps.db).listRange(userId, from, to);
          return sets.map((m) => ({
            asOf: m.asOf as string,
            metrics: m as unknown as Record<string, unknown>,
          }));
        },
      );

      v1.patch(
        "/transactions/:id",
        {
          schema: {
            params: transactionIdParams,
            body: patchTransactionBody,
            response: {
              200: transactionSchema,
              400: errorSchema,
              401: errorSchema,
              404: errorSchema,
            },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const txn = await createTransactionRepository(deps.db).setCategoryByUser(
            userId,
            transactionId(request.params.id),
            request.body.category,
          );
          if (txn === null) return reply.status(404).send({ error: "unknown transaction" });
          // The correction becomes a standing rule so the next occurrence of
          // the same merchant lands right without another correction.
          await createUserCategoryRuleStore(deps.db).upsert(
            userId,
            txn.source,
            normalizeMatchKey(txn.merchant ?? null, txn.description),
            request.body.category,
            "user",
          );
          return txn;
        },
      );

      v1.get(
        "/products/:product/state",
        {
          schema: {
            params: productParams,
            response: { 200: productStateSchema, 401: errorSchema, 404: errorSchema },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const record = await createProductStateStore(deps.db).get(userId, request.params.product);
          if (record === null) return reply.status(404).send({ error: "no state" });
          return record as { product: string; version: number; data: Record<string, unknown> };
        },
      );

      v1.put(
        "/products/:product/state",
        {
          bodyLimit: 131_072,
          schema: {
            params: productParams,
            body: putStateBody,
            response: {
              200: putStateResultSchema,
              400: errorSchema,
              401: errorSchema,
              409: errorSchema,
            },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          const result = await createProductStateStore(deps.db).put(
            userId,
            request.params.product,
            request.body.data,
            request.body.baseVersion,
          );
          if (result === "conflict") return reply.status(409).send({ error: "version conflict" });
          return result;
        },
      );

      v1.post(
        "/sync",
        {
          schema: {
            response: { 200: syncRunSchema, 401: errorSchema, 503: errorSchema },
          },
        },
        async (request, reply) => {
          const userId = await requireUser(request);
          if (deps.sync === undefined) {
            return reply.status(503).send({ error: "sync not configured" });
          }
          return await deps.sync(userId);
        },
      );

      // Data rights (ARCHITECTURE.md "Security, Privacy & Trust"): the full
      // archive of everything held for the caller. Secret ids never appear.
      v1.get(
        "/export",
        { schema: { response: { 200: exportSchema, 401: errorSchema } } },
        async (request) => {
          const userId = await requireUser(request);
          const [
            accounts,
            liabilities,
            transactions,
            budgets,
            goals,
            activity,
            events,
            latest,
            rules,
            connections,
            kingdomState,
            kingdomMeta,
          ] = await Promise.all([
            createAccountRepository(deps.db).listActive(userId),
            createLiabilityRepository(deps.db).listForUser(userId),
            createTransactionRepository(deps.db).findByUser(userId, {}),
            createBudgetRepository(deps.db).listActive(userId),
            createGoalRepository(deps.db).listActive(userId),
            createInvestmentActivityRepository(deps.db).findByUser(userId, {}),
            createEventStore(deps.db).listSinceSeq(userId, 0, 100_000),
            createMetricSnapshotStore(deps.db).latest(userId),
            createUserCategoryRuleStore(deps.db).listForUser(userId, "plaid"),
            createConnectionStore(deps.db).list(userId),
            createProductStateStore(deps.db).get(userId, "kingdom"),
            createProductStateStore(deps.db).get(userId, "kingdom-meta"),
          ]);
          const byAccount = new Map(liabilities.map((l) => [l.accountId, l]));
          return {
            exportedAt: new Date().toISOString(),
            accounts: accounts.map((a) => {
              const l = byAccount.get(a.id);
              return l === undefined
                ? a
                : { ...a, ...(l.aprBps === undefined ? {} : { apr: l.aprBps / 100 }) };
            }),
            transactions,
            budgets,
            goals,
            investmentActivity: activity,
            events: events.map((s) => ({
              id: s.id,
              seq: s.seq,
              type: s.event.type,
              occurredOn: s.event.occurredOn as string,
              createdAt: s.createdAt,
              payload: s.event as unknown as Record<string, unknown>,
            })),
            latestMetrics:
              latest === null
                ? null
                : {
                    asOf: latest.asOf as string,
                    metrics: latest as unknown as Record<string, unknown>,
                  },
            productState: [kingdomState, kingdomMeta]
              .filter((s) => s !== null)
              .map((s) => ({
                product: s.product,
                version: s.version,
                data: s.data as Record<string, unknown>,
              })),
            categoryRules: [...rules.entries()].map(([matchKey, r]) => ({
              matchKey,
              category: r.category,
              origin: r.origin,
            })),
            connections: connections.map((c) => ({
              institution: c.institutionName,
              status: c.status,
            })),
          };
        },
      );

      // The full wipe: every platform row + vault tokens. Plaid /item/remove
      // is opt-in (Trial plan: Items are lifetime-capped; see schemas.ts).
      v1.delete(
        "/data",
        {
          schema: {
            body: deleteDataBody,
            response: { 200: wipeReportSchema, 400: errorSchema, 401: errorSchema },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          let revokedAtPlaid = 0;
          if (request.body.alsoRevokeAtPlaid && deps.revokePlaidItem !== undefined) {
            for (const c of await createConnectionStore(deps.db).list(userId)) {
              try {
                await deps.revokePlaidItem(c.accessTokenSecretId);
                revokedAtPlaid++;
              } catch (err) {
                request.log.warn(
                  { message: err instanceof Error ? err.message : String(err) },
                  "plaid item revoke failed",
                );
              }
            }
          }
          const report = await deleteAllUserData(deps.db, userId);
          request.log.info({ userId, ...report.deleted }, "data wipe");
          return { ...report, revokedAtPlaid };
        },
      );

      v1.get(
        "/events",
        {
          schema: {
            querystring: eventsQuery,
            response: { 200: z.array(eventSchema), 401: errorSchema },
          },
        },
        async (request) => {
          const userId = await requireUser(request);
          const store = createEventStore(deps.db);
          const stored =
            request.query.sinceSeq !== undefined
              ? await store.listSinceSeq(userId, request.query.sinceSeq, request.query.limit)
              : request.query.since !== undefined
                ? await store.listSince(userId, new Date(request.query.since), request.query.limit)
                : await store.listRecent(userId, request.query.limit);
          return stored.map((s) => ({
            id: s.id,
            seq: s.seq,
            type: s.event.type,
            occurredOn: s.event.occurredOn as string,
            createdAt: s.createdAt,
            payload: s.event as unknown as Record<string, unknown>,
          }));
        },
      );
    },
    { prefix: "/api/v1" },
  );

  return app;
}
