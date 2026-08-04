// Minimal Anthropic Messages client, mirroring plaid/client.ts: config
// injected, fetch injectable for tests, typed error. No SDK — the scribe
// needs exactly one endpoint.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicConfig {
  readonly apiKey: string;
  /** Model alias; the scribe's default is the cheap classification tier. */
  readonly model?: string;
}

export class AnthropicError extends Error {
  readonly status: number;
  readonly type: string;
  constructor(status: number, body: Record<string, unknown>) {
    const err = (body.error ?? {}) as Record<string, unknown>;
    super(String(err.message ?? "Anthropic error"));
    this.status = status;
    this.type = String(err.type ?? "unknown");
  }
}

export interface AnthropicHttp {
  messages(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createAnthropicClient(
  config: AnthropicConfig,
  fetchImpl: typeof fetch = fetch,
): AnthropicHttp {
  const call = async (body: Record<string, unknown>): Promise<Response> =>
    fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

  return {
    async messages(body) {
      let res = await call(body);
      // One retry on rate limit / overload, honoring retry-after. The scribe
      // is idempotent and re-runs daily, so anything further is just "skip".
      if (res.status === 429 || res.status === 529) {
        const after = Number(res.headers.get("retry-after") ?? "1");
        await new Promise((r) => setTimeout(r, Math.min(after, 10) * 1000));
        res = await call(body);
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new AnthropicError(res.status, json);
      return json;
    },
  };
}
