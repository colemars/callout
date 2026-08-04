import createOpenApiClient from "openapi-fetch";
import type { paths } from "./generated/schema.js";

export type { components, paths } from "./generated/schema.js";

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Returns the current Supabase access token (or null when signed out). */
  readonly getToken: () => Promise<string | null> | string | null;
  /** Injectable for tests / non-browser runtimes. */
  readonly fetch?: typeof fetch;
}

/**
 * The one true way products talk to the platform ("no frontend manually
 * builds requests"): a typed openapi-fetch client that attaches the caller's
 * Supabase JWT to every request.
 */
export function createApiClient(options: ApiClientOptions) {
  const client = createOpenApiClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  client.use({
    async onRequest({ request }) {
      const token = await options.getToken();
      if (token !== null) {
        request.headers.set("authorization", `Bearer ${token}`);
      }
      return request;
    },
  });

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
