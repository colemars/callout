// Local/dev + future-ECS entrypoint: build the app from env and listen.
import { createSupabaseJwtVerifier } from "@platform/auth";
import { createDb } from "@platform/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createUserSync } from "./sync.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL, { max: config.DB_POOL_MAX });
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

await app.listen({ port: config.PORT, host: "0.0.0.0" });
