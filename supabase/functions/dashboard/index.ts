// Read-only status page. Gate: x-app-token header or ?token=<app_config.app_token>.
// ?format=json returns the raw data for the static GitHub Pages client.
import { db, requireToken } from "../_shared/plaid.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-app-token, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const unauth = await requireToken(req, "app_token");
  if (unauth) return new Response("Unauthorized", { status: 401, headers: cors });

  const [accounts, budgets, debt, health, reports] = await Promise.all([
    db.from("accounts").select("*").eq("is_active", true).order("institution"),
    db.from("v_budget_status").select("*"),
    db.from("v_debt_trajectory").select("*"),
    db.from("v_sync_health").select("*").single(),
    db.from("reports").select("cadence, subject, created_at").order("created_at", { ascending: false }).limit(3),
  ]);

  if (new URL(req.url).searchParams.get("format") === "json") {
    return new Response(
      JSON.stringify({
        accounts: accounts.data ?? [],
        budgets: budgets.data ?? [],
        debt: debt.data ?? [],
        health: health.data ?? null,
        reports: reports.data ?? [],
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const fmt = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

  const acctRows = (accounts.data ?? []).map((a) =>
    `<tr><td>${esc(a.institution)}</td><td>${esc(a.name)} ${a.mask ? "···" + esc(a.mask) : ""}</td>
     <td>${esc(a.type)}</td><td class="num">${fmt(a.current_balance)}</td></tr>`
  ).join("");

  const budgetRows = (budgets.data ?? []).map((b) => {
    const pct = Math.min(150, Number(b.pct_of_monthly_cap ?? 0));
    const over = Number(b.spent_mtd) > Number(b.prorated_cap);
    return `<tr><td>${esc(b.category)}</td>
      <td class="num">${fmt(Number(b.spent_mtd))} / ${fmt(Number(b.monthly_cap))}</td>
      <td class="bar"><div style="width:${pct / 1.5}%;background:${over ? "#d33" : "#4a4"}"></div></td></tr>`;
  }).join("");

  const debtRows = (debt.data ?? []).map((d) =>
    `<tr><td>${esc(d.institution)} ${esc(d.name)}</td><td class="num">${fmt(d.current_balance)}</td>
     <td class="num">${d.delta_30d == null ? "—" : (d.delta_30d > 0 ? "▲" : "▼") + fmt(Math.abs(d.delta_30d))}</td></tr>`
  ).join("");

  const reportRows = (reports.data ?? []).map((r) =>
    `<li>[${esc(r.cadence)}] ${esc(r.subject)} <small>${esc(String(r.created_at).slice(0, 10))}</small></li>`
  ).join("");

  const h = health.data;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>callout</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem}
table{border-collapse:collapse;width:100%;margin-bottom:1.5rem}
td,th{padding:.35rem .5rem;border-bottom:1px solid #ddd;text-align:left;font-size:.9rem}
.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{width:40%}.bar div{height:10px;border-radius:5px}
small{color:#888}
</style></head><body>
<h1>callout</h1>
<p><small>Last Plaid sync: ${esc(h?.last_plaid_sync ?? "never")} ·
Items needing attention: ${esc(h?.items_needing_attention ?? 0)} ·
Newest Apple txn: ${esc(h?.newest_apple_txn ?? "none")}</small></p>
<h2>Accounts</h2><table>${acctRows || "<tr><td>No accounts linked yet.</td></tr>"}</table>
<h2>Budgets (month to date)</h2><table>${budgetRows || "<tr><td>No budgets set.</td></tr>"}</table>
<h2>Debt (30-day change)</h2><table>${debtRows || "<tr><td>No credit/loan accounts yet.</td></tr>"}</table>
<h2>Recent reports</h2><ul>${reportRows || "<li>None yet.</li>"}</ul>
</body></html>`;

  return new Response(html, { headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
});
