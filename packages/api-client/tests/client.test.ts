import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index.js";

function fakeFetch(body: unknown) {
  const requests: Request[] = [];
  const impl = (async (input: Request | string | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    requests.push(request);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, requests };
}

describe("createApiClient", () => {
  it("attaches the bearer token and hits the typed path", async () => {
    const { impl, requests } = fakeFetch([]);
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: () => "jwt-123",
      fetch: impl,
    });

    const { data, response } = await client.GET("/api/v1/accounts");
    expect(response.status).toBe(200);
    expect(data).toEqual([]);
    expect(requests[0]?.url).toBe("https://api.example.com/api/v1/accounts");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer jwt-123");
  });

  it("sends no auth header when signed out", async () => {
    const { impl, requests } = fakeFetch({ ok: true });
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: () => null,
      fetch: impl,
    });
    await client.GET("/health");
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  it("serializes typed query params", async () => {
    const { impl, requests } = fakeFetch([]);
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: () => "jwt-123",
      fetch: impl,
    });
    await client.GET("/api/v1/transactions", {
      params: { query: { from: "2026-08-01", to: "2026-08-31" } },
    });
    expect(requests[0]?.url).toBe(
      "https://api.example.com/api/v1/transactions?from=2026-08-01&to=2026-08-31",
    );
  });
});
