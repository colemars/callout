// Local/dev + future-ECS entrypoint: build the app from env and listen.
import { createSupabaseJwtVerifier } from "@platform/auth";
import { createDb } from "@platform/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createUserSync } from "./sync.js";
import { createPlaidWebhook } from "./webhooks.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL, { max: config.DB_POOL_MAX });

const plaid =
  config.PLAID_CLIENT_ID !== undefined && config.PLAID_SECRET !== undefined
    ? { clientId: config.PLAID_CLIENT_ID, secret: config.PLAID_SECRET, env: config.PLAID_ENV }
    : undefined;
const sync =
  plaid === undefined
    ? undefined
    : createUserSync(
        db,
        plaid,
        config.ANTHROPIC_API_KEY === undefined ? undefined : { apiKey: config.ANTHROPIC_API_KEY },
      );

const app = await buildApp({
  db,
  verifier: createSupabaseJwtVerifier({ supabaseUrl: config.SUPABASE_URL }),
  corsOrigins: config.CORS_ORIGINS,
  ...(sync === undefined ? {} : { sync }),
  ...(plaid === undefined ? {} : { plaidWebhook: createPlaidWebhook(db, plaid, sync) }),
});

await app.listen({ port: config.PORT, host: "0.0.0.0" });
