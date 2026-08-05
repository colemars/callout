// Bank linking API (+ re-auth via Link update mode). JSON only — the UI is
// The Counting House (kingdom-web /banks). Multi-tenant: every caller is a
// Supabase-authenticated user; connections land in platform.provider_connections
// under the caller's user id. No shared secrets, no hardwired users.
import { db, plaid } from "../_shared/plaid.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const connections = () => db.schema("platform").from("provider_connections");

async function requireUser(req: Request): Promise<{ id: string } | null> {
  const bearer = req.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return null;
  const { data, error } = await db.auth.getUser(bearer.slice(7));
  if (error || !data.user) return null;
  return { id: data.user.id };
}

async function handlePost(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (body.action === "create_link_token") {
    const params: Record<string, unknown> = {
      user: { client_user_id: userId },
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
      // Update mode: reuse the existing Item's access token — caller must own it.
      const { data: item } = await connections()
        .select("access_token_secret_id")
        .eq("id", body.update_item_id).eq("user_id", userId).single();
      if (!item) return json({ error: "unknown item" }, 404);
      const { data: token } = await db.rpc("get_plaid_token", {
        p_secret_id: item.access_token_secret_id,
      });
      params.access_token = token;
      // A re-oath is the moment to gather consent the item was born without.
      params.additional_consented_products = ["investments", "liabilities"];
    } else {
      params.products = ["transactions"];
      // Attach when the institution supports them; plain banks still link.
      params.optional_products = ["investments", "liabilities"];
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
    const { error: insertError } = await connections().upsert(
      {
        user_id: userId,
        provider: "plaid",
        external_item_id: resp.item_id,
        institution_name: body.institution ?? "Unknown",
        access_token_secret_id: secretId,
        cursor: null,
        status: "ok",
      },
      { onConflict: "user_id,provider,external_item_id" },
    );
    if (insertError) return json({ error: insertError.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "relinked") {
    await connections().update({ status: "ok" })
      .eq("id", body.item_id).eq("user_id", userId);
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const user = await requireUser(req);
  if (user === null) return new Response("Unauthorized", { status: 401, headers: cors });

  if (req.method === "POST") {
    try {
      return await handlePost(user.id, await req.json());
    } catch (err) {
      // Errors reach the page as JSON — never an opaque 500.
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  const { data: items } = await connections()
    .select("id, institution_name, status, last_synced_at")
    .eq("user_id", user.id)
    .order("institution_name");
  return json({ items: items ?? [] });
});
