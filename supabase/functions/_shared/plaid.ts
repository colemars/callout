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

// Plaid credentials: env vars win; the fallback reads app_config for the
// client id and resolves the SECRET from Supabase Vault by the id stored in
// app_config.plaid_secret_vault_id — the secret itself never sits in a
// plain table (ARCHITECTURE.md "Security, Privacy & Trust").
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
    .in("key", ["plaid_client_id", "plaid_secret_vault_id", "plaid_env"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const vaultId = map.get("plaid_secret_vault_id");
  let secret = "";
  if (vaultId) {
    const { data: token } = await db.rpc("get_plaid_token", { p_secret_id: vaultId });
    secret = token ?? "";
  }
  credsCache = {
    clientId: map.get("plaid_client_id") ?? "",
    secret,
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
