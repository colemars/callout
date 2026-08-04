// Bank linking API (+ re-auth via Link update mode). JSON only — the UI lives
// on GitHub Pages (web/link.html); supabase.co no longer serves HTML from
// edge functions. Gate: x-app-token header or ?token= (app_config.app_token).
import { db, plaid, requireToken } from "../_shared/plaid.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-app-token, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function handlePost(body: Record<string, unknown>): Promise<Response> {
  if (body.action === "create_link_token") {
    const params: Record<string, unknown> = {
      user: { client_user_id: "cole" },
      client_name: "Penny Kingdom",
      language: "en",
      country_codes: ["US"],
    };
    // OAuth institutions require an allowlisted redirect back to the link page.
    let redirectUri = Deno.env.get("PLAID_REDIRECT_URI");
    if (!redirectUri) {
      const { data: cfg } = await db.from("app_config")
        .select("value").eq("key", "plaid_redirect_uri").maybeSingle();
      redirectUri = cfg?.value ?? undefined;
    }
    if (redirectUri) params.redirect_uri = redirectUri;
    if (body.update_item_id) {
      // Update mode: reuse the existing Item's access token.
      const { data: item } = await db.from("plaid_items")
        .select("access_token_secret_id").eq("id", body.update_item_id).single();
      if (!item) return json({ error: "unknown item" }, 404);
      const { data: token } = await db.rpc("get_plaid_token", {
        p_secret_id: item.access_token_secret_id,
      });
      params.access_token = token;
    } else {
      params.products = ["transactions"];
      // Investments attaches when the institution supports it; plain banks still link.
      params.optional_products = ["investments"];
    }
    let resp: { link_token: string };
    try {
      resp = await plaid("/link/token/create", params);
    } catch (err) {
      // Until the redirect URI is registered in the Plaid dashboard allowlist,
      // Plaid rejects it — retry without so linking keeps working (OAuth banks
      // won't complete their return leg until registration; non-OAuth is fine).
      if (params.redirect_uri === undefined) throw err;
      delete params.redirect_uri;
      resp = await plaid("/link/token/create", params);
    }
    return json({ link_token: resp.link_token });
  }

  if (body.action === "exchange") {
    const resp = await plaid("/item/public_token/exchange", { public_token: body.public_token });
    const { data: secretId, error } = await db.rpc("store_plaid_token", {
      p_name: `plaid-${resp.item_id}`,
      p_token: resp.access_token,
    });
    if (error) return json({ error: error.message }, 500);
    await db.from("plaid_items").insert({
      plaid_item_id: resp.item_id,
      institution_name: body.institution ?? "Unknown",
      access_token_secret_id: secretId,
    });
    return json({ ok: true });
  }

  if (body.action === "relinked") {
    await db.from("plaid_items").update({ status: "ok" }).eq("id", body.item_id);
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const unauth = await requireToken(req, "app_token");
  if (unauth) return new Response("Unauthorized", { status: 401, headers: cors });

  if (req.method === "POST") {
    try {
      return await handlePost(await req.json());
    } catch (err) {
      // Errors reach the page as JSON — never an opaque 500.
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  const { data: items } = await db.from("plaid_items")
    .select("id, institution_name, status, last_synced_at").order("institution_name");
  return json({ items: items ?? [] });
});
