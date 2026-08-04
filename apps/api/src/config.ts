import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url().default("https://hkxerogzvowkyvdifbpn.supabase.co"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Comma-separated allowed origins; '*' for any (default until products exist). */
  CORS_ORIGINS: z.string().default("*"),
  /** postgres-js pool size; set 1 on Lambda. */
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return envSchema.parse(env);
}
