import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { AuthenticatedUser, JwtVerifier } from "@platform/auth";
import { AuthError } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import type { DateRange, ISODate, UserId } from "@platform/financial-core";
import { isoDate, transactionId } from "@platform/financial-core";
import { normalizeMatchKey } from "@platform/ingestion";
import {
  createAccountRepository,
  createBudgetRepository,
  createEventStore,
  createGoalRepository,
  createInvestmentActivityRepository,
  createLiabilityRepository,
  createMetricSnapshotStore,
  createProductStateStore,
  createTransactionRepository,
  createUserCategoryRuleStore,
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
  budgetSchema,
  dateRangeQuery,
  errorSchema,
  eventSchema,
  eventsQuery,
  goalSchema,
  historyQuery,
  investmentActivitySchema,
  patchTransactionBody,
  productParams,
  productStateSchema,
  putStateBody,
  putStateResultSchema,
  snapshotSchema,
  syncRunSchema,
  transactionIdParams,
  transactionSchema,
} from "./schemas.js";
import type { UserSync } from "./sync.js";

export interface AppDeps {
  readonly db: PlatformDb;
  readonly verifier: JwtVerifier;
  readonly corsOrigins?: string;
  readonly logger?: boolean;
  /** On-demand sync for the calling user; absent when Plaid creds aren't configured. */
  readonly sync?: UserSync;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

/**
 * Pure app factory (no listening, no env reads) — used by server.ts,
 * lambda.ts, emit-openapi.ts, and tests via app.inject().
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? true,
    requestIdHeader: "x-request-id",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("user", null);

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
    request.log.error(error);
    return reply.status(500).send({ error: "internal error" });
  });

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
