// Local/dev + future-ECS entrypoint: build the app from env and listen.
import { createSupabaseJwtVerifier } from "@platform/auth";
import { createDb } from "@platform/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp({
  db: createDb(config.DATABASE_URL, { max: config.DB_POOL_MAX }),
  verifier: createSupabaseJwtVerifier({ supabaseUrl: config.SUPABASE_URL }),
  corsOrigins: config.CORS_ORIGINS,
});

await app.listen({ port: config.PORT, host: "0.0.0.0" });
