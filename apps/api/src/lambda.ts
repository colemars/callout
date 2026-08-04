// Lambda entrypoint (Phase 7 deploy target). Same app, different transport.
import awsLambdaFastify from "@fastify/aws-lambda";
import { createSupabaseJwtVerifier } from "@platform/auth";
import { createDb } from "@platform/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp({
  db: createDb(config.DATABASE_URL, { max: 1 }), // one connection per Lambda container
  verifier: createSupabaseJwtVerifier({ supabaseUrl: config.SUPABASE_URL }),
  corsOrigins: config.CORS_ORIGINS,
});

// Don't wait for the event loop to drain: the postgres pool keeps sockets
// open between invocations (that's the point of a pool).
export const handler = awsLambdaFastify(app, { callbackWaitsForEmptyEventLoop: false });
