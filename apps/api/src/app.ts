import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { AuthenticatedUser, JwtVerifier } from "@platform/auth";
import { AuthError } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import type { DateRange, ISODate, UserId } from "@platform/financial-core";
import { isoDate } from "@platform/financial-core";
import {
  createAccountRepository,
  createBudgetRepository,
  createEventStore,
  createGoalRepository,
  createMetricSnapshotStore,
  createTransactionRepository,
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
  snapshotSchema,
  transactionSchema,
} from "./schemas.js";

export interface AppDeps {
  readonly db: PlatformDb;
  readonly verifier: JwtVerifier;
  readonly corsOrigins?: string;
  readonly logger?: boolean;
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
          return createAccountRepository(deps.db).listActive(userId);
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
            request.query.since === undefined
              ? await store.listRecent(userId, request.query.limit)
              : await store.listSince(userId, new Date(request.query.since), request.query.limit);
          return stored.map((s) => ({
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
