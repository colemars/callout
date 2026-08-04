import { createClient } from "jsr:@supabase/supabase-js@2";

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export class PlaidError extends Error {
  code: string;
  constructor(public body: Record<string, unknown>) {
    super(String(body.error_message ?? "Plaid error"));
    this.code = String(body.error_code ?? "UNKNOWN");
  }
}

// Plaid credentials: env vars win; app_config is the fallback so setup can be
// done entirely through the database (keys: plaid_client_id/plaid_secret/plaid_env).
let credsCache: { clientId: string; secret: string; env: string } | null = null;

async function plaidCreds() {
  if (credsCache) return credsCache;
  const envId = Deno.env.get("PLAID_CLIENT_ID");
  const envSecret = Deno.env.get("PLAID_SECRET");
  if (envId && envSecret) {
    credsCache = { clientId: envId, secret: envSecret, env: Deno.env.get("PLAID_ENV") ?? "sandbox" };
    return credsCache;
  }
  const { data } = await db.from("app_config").select("key, value")
    .in("key", ["plaid_client_id", "plaid_secret", "plaid_env"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  credsCache = {
    clientId: map.get("plaid_client_id") ?? "",
    secret: map.get("plaid_secret") ?? "",
    env: Deno.env.get("PLAID_ENV") ?? map.get("plaid_env") ?? "sandbox",
  };
  return credsCache;
}

export async function plaid(path: string, body: Record<string, unknown>) {
  const creds = await plaidCreds();
  const res = await fetch(`${PLAID_HOSTS[creds.env]}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      secret: creds.secret,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new PlaidError(json);
  return json;
}

// Auth: compares x-app-token header (or ?token=) against a value in app_config.
export async function requireToken(
  req: Request,
  configKey: string,
): Promise<Response | null> {
  const { data } = await db.from("app_config").select("value").eq("key", configKey).single();
  const url = new URL(req.url);
  const got = req.headers.get("x-app-token") ?? url.searchParams.get("token");
  if (!data?.value || got !== data.value) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

const DELIVERY_RE = /(doordash|door dash|uber\s*eats|grubhub|instacart|postmates|seamless|caviar|favor delivery)/i;
const COFFEE_RE = /(starbucks|dunkin|blue bottle|peet'?s|philz|dutch bros)/i;

export function mapCategory(
  catMap: Map<string, string>,
  detailed: string | null,
  primary: string | null,
  merchant: string | null,
  name: string,
): string {
  const label = `${merchant ?? ""} ${name}`;
  if (DELIVERY_RE.test(label)) return "delivery";
  if (COFFEE_RE.test(label)) return "coffee";
  if (detailed && catMap.has(detailed)) return catMap.get(detailed)!;
  if (primary && catMap.has(primary)) return catMap.get(primary)!;
  return "other";
}
