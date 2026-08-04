// Lambda entrypoint (Phase 7 deploy target). Same app, different transport.
import awsLambdaFastify from "@fastify/aws-lambda";
import { createSupabaseJwtVerifier } from "@platform/auth";
import { createDb } from "@platform/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createUserSync } from "./sync.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL, { max: 1 }); // one connection per Lambda container
const app = await buildApp({
  db,
  verifier: createSupabaseJwtVerifier({ supabaseUrl: config.SUPABASE_URL }),
  corsOrigins: config.CORS_ORIGINS,
  ...(config.PLAID_CLIENT_ID !== undefined && config.PLAID_SECRET !== undefined
    ? {
        sync: createUserSync(
          db,
          {
            clientId: config.PLAID_CLIENT_ID,
            secret: config.PLAID_SECRET,
            env: config.PLAID_ENV,
          },
          config.ANTHROPIC_API_KEY === undefined ? undefined : { apiKey: config.ANTHROPIC_API_KEY },
        ),
      }
    : {}),
});

// Don't wait for the event loop to drain: the postgres pool keeps sockets
// open between invocations (that's the point of a pool).
export const handler = awsLambdaFastify(app, { callbackWaitsForEmptyEventLoop: false });
