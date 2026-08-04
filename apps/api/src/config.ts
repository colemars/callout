import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url().default("https://hkxerogzvowkyvdifbpn.supabase.co"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Comma-separated allowed origins; '*' for any (default until products exist). */
  CORS_ORIGINS: z.string().default("*"),
  /** postgres-js pool size; set 1 on Lambda. */
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Plaid credentials — when present, POST /api/v1/sync is enabled. */
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /** When present, POST /api/v1/sync also runs the AI scribe. */
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return envSchema.parse(env);
}
