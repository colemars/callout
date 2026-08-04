// Ported from callout's supabase/functions/_shared/plaid.ts with configuration
// injected instead of read from globals (Deno.env -> constructor).

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
} as const;

export interface PlaidConfig {
  readonly clientId: string;
  readonly secret: string;
  readonly env: keyof typeof PLAID_HOSTS;
}

export class PlaidError extends Error {
  readonly code: string;
  constructor(body: Record<string, unknown>) {
    super(String(body.error_message ?? "Plaid error"));
    this.code = String(body.error_code ?? "UNKNOWN");
  }
}

export interface PlaidHttp {
  post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createPlaidClient(config: PlaidConfig, fetchImpl: typeof fetch = fetch): PlaidHttp {
  return {
    async post(path, body) {
      const res = await fetchImpl(`${PLAID_HOSTS[config.env]}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new PlaidError(json);
      return json;
    },
  };
}
