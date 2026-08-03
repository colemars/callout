// Daily transaction sync. Invoked by pg_cron (x-app-token = app_config.sync_token)
// or manually. Deterministic: no LLM involvement.
import { db, mapCategory, plaid, PlaidError, requireToken } from "../_shared/plaid.ts";

type Item = {
  id: string;
  plaid_item_id: string;
  institution_name: string;
  access_token_secret_id: string;
  sync_cursor: string | null;
};

Deno.serve(async (req) => {
  const unauth = await requireToken(req, "sync_token");
  if (unauth) return unauth;

  const { data: items, error } = await db.from("plaid_items").select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: catRows } = await db.from("category_map").select("source_category, category").eq("source", "plaid");
  const catMap = new Map((catRows ?? []).map((r) => [r.source_category, r.category]));

  const results = [];
  for (const item of (items ?? []) as Item[]) {
    try {
      results.push(await syncItem(item, catMap));
    } catch (e) {
      if (e instanceof PlaidError && e.code === "ITEM_LOGIN_REQUIRED") {
        await db.from("plaid_items").update({ status: "login_required" }).eq("id", item.id);
        results.push({ institution: item.institution_name, status: "login_required" });
      } else {
        await db.from("plaid_items").update({ status: "error" }).eq("id", item.id);
        results.push({ institution: item.institution_name, status: "error", message: String(e) });
      }
    }
  }
  return Response.json({ results });
});

async function syncItem(item: Item, catMap: Map<string, string>) {
  const { data: accessToken, error: tokErr } = await db.rpc("get_plaid_token", {
    p_secret_id: item.access_token_secret_id,
  });
  if (tokErr || !accessToken) throw new Error(`vault: ${tokErr?.message ?? "no token"}`);

  // Accounts + balances first (loan accounts may never appear in /transactions/sync).
  const acctResp = await plaid("/accounts/get", { access_token: accessToken });
  const accountIds = await upsertAccounts(item, acctResp.accounts);

  let cursor = item.sync_cursor;
  let added = 0, modified = 0, removed = 0;
  while (true) {
    const resp = await plaid("/transactions/sync", {
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: 500,
    });
    for (const t of [...resp.added, ...resp.modified]) {
      const accountId = accountIds.get(t.account_id);
      if (!accountId) continue;
      await db.from("transactions").upsert({
        account_id: accountId,
        source: "plaid",
        source_txn_id: t.transaction_id,
        posted_at: t.date,
        authorized_at: t.authorized_date,
        posted_time: t.datetime ?? t.authorized_datetime,
        name: t.name,
        merchant: t.merchant_name,
        amount: t.amount, // Plaid: positive = outflow
        pending: t.pending,
        source_category: t.personal_finance_category?.detailed ?? null,
        category: mapCategory(
          catMap,
          t.personal_finance_category?.detailed ?? null,
          t.personal_finance_category?.primary ?? null,
          t.merchant_name,
          t.name,
        ),
      }, { onConflict: "source,source_txn_id" });
    }
    added += resp.added.length;
    modified += resp.modified.length;
    if (resp.removed.length) {
      await db.from("transactions").delete()
        .eq("source", "plaid")
        .in("source_txn_id", resp.removed.map((r: { transaction_id: string }) => r.transaction_id));
      removed += resp.removed.length;
    }
    cursor = resp.next_cursor;
    if (!resp.has_more) break;
  }

  await db.from("plaid_items").update({
    sync_cursor: cursor,
    status: "ok",
    last_synced_at: new Date().toISOString(),
  }).eq("id", item.id);

  return { institution: item.institution_name, status: "ok", added, modified, removed };
}

async function upsertAccounts(
  item: Item,
  accounts: Array<Record<string, any>>,
): Promise<Map<string, string>> {
  const today = new Date().toISOString().slice(0, 10);
  const ids = new Map<string, string>();
  for (const a of accounts) {
    const { data, error } = await db.from("accounts").upsert({
      source: "plaid",
      plaid_account_id: a.account_id,
      item_id: item.id,
      name: a.name,
      institution: item.institution_name,
      type: a.type,
      subtype: a.subtype,
      mask: a.mask,
      current_balance: a.balances.current,
      credit_limit: a.balances.limit,
      balance_updated_at: new Date().toISOString(),
    }, { onConflict: "plaid_account_id" }).select("id").single();
    if (error) throw new Error(`account upsert: ${error.message}`);
    ids.set(a.account_id, data.id);
    if (a.balances.current != null) {
      await db.from("balance_snapshots").upsert({
        account_id: data.id,
        as_of: today,
        current_balance: a.balances.current,
      }, { onConflict: "account_id,as_of" });
    }
  }
  return ids;
}
