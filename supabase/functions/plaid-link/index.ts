// One-time bank linking page (+ re-auth via Link update mode).
// Gate: ?token=<app_config.app_token>. GET serves HTML; POST handles link-token/exchange.
import { db, plaid, requireToken } from "../_shared/plaid.ts";

Deno.serve(async (req) => {
  const unauth = await requireToken(req, "app_token");
  if (unauth) return unauth;

  if (req.method === "POST") {
    const body = await req.json();
    if (body.action === "create_link_token") {
      const params: Record<string, unknown> = {
        user: { client_user_id: "cole" },
        client_name: "callout",
        language: "en",
        country_codes: ["US"],
      };
      const redirectUri = Deno.env.get("PLAID_REDIRECT_URI");
      if (redirectUri) params.redirect_uri = redirectUri;
      if (body.update_item_id) {
        // Update mode: reuse the existing Item's access token.
        const { data: item } = await db.from("plaid_items")
          .select("access_token_secret_id").eq("id", body.update_item_id).single();
        if (!item) return Response.json({ error: "unknown item" }, { status: 404 });
        const { data: token } = await db.rpc("get_plaid_token", {
          p_secret_id: item.access_token_secret_id,
        });
        params.access_token = token;
      } else {
        params.products = ["transactions"];
      }
      const resp = await plaid("/link/token/create", params);
      return Response.json({ link_token: resp.link_token });
    }

    if (body.action === "exchange") {
      const resp = await plaid("/item/public_token/exchange", { public_token: body.public_token });
      const { data: secretId, error } = await db.rpc("store_plaid_token", {
        p_name: `plaid-${resp.item_id}`,
        p_token: resp.access_token,
      });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      await db.from("plaid_items").insert({
        plaid_item_id: resp.item_id,
        institution_name: body.institution ?? "Unknown",
        access_token_secret_id: secretId,
      });
      return Response.json({ ok: true });
    }

    if (body.action === "relinked") {
      await db.from("plaid_items").update({ status: "ok" }).eq("id", body.item_id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  const { data: items } = await db.from("plaid_items")
    .select("id, institution_name, status, last_synced_at").order("institution_name");
  const rows = (items ?? []).map((i) =>
    `<li>${esc(i.institution_name)} — ${i.status}` +
    (i.status !== "ok" ? ` <button onclick="start('${i.id}')">Re-link</button>` : "") +
    `</li>`
  ).join("");

  return new Response(PAGE.replace("<!--ITEMS-->", rows), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>callout — link banks</title>
<style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:3rem auto;padding:0 1rem}
button{font-size:1rem;padding:.5rem 1rem;cursor:pointer}</style>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
</head><body>
<h1>callout</h1>
<p>Linked institutions:</p><ul><!--ITEMS--></ul>
<button onclick="start()">Link a new bank</button>
<p id="msg"></p>
<script>
const qs = new URLSearchParams(location.search);
const token = qs.get('token');
const api = (body) => fetch(location.pathname + '?token=' + token, {
  method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
}).then(r => r.json());

async function start(updateItemId) {
  const oauthStateId = qs.get('oauth_state_id');
  let linkToken;
  if (oauthStateId) {
    linkToken = localStorage.getItem('callout_link_token');
    updateItemId = localStorage.getItem('callout_update_item') || undefined;
  } else {
    const r = await api({ action: 'create_link_token', update_item_id: updateItemId });
    linkToken = r.link_token;
    localStorage.setItem('callout_link_token', linkToken);
    if (updateItemId) localStorage.setItem('callout_update_item', updateItemId);
    else localStorage.removeItem('callout_update_item');
  }
  const handler = Plaid.create({
    token: linkToken,
    receivedRedirectUri: oauthStateId ? window.location.href : undefined,
    onSuccess: async (public_token, metadata) => {
      if (updateItemId) await api({ action: 'relinked', item_id: updateItemId });
      else await api({ action: 'exchange', public_token, institution: metadata.institution && metadata.institution.name });
      document.getElementById('msg').textContent = 'Linked. Reloading…';
      location.href = location.pathname + '?token=' + token;
    },
    onExit: (err) => {
      if (err) document.getElementById('msg').textContent = 'Exited: ' + (err.display_message || err.error_code);
    },
  });
  handler.open();
}
// Resume OAuth redirect flow automatically.
if (qs.get('oauth_state_id')) start();
</script>
</body></html>`;
