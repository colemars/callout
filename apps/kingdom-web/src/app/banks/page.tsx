"use client";

// The Counting House — bank linking behind the crown's own seal (Supabase
// Auth), replacing the legacy app-token page. The edge function accepts the
// session JWT; no shared secret ever reaches this page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { clients, supabase } from "../../lib/clients";

const LINK_API = "https://hkxerogzvowkyvdifbpn.supabase.co/functions/v1/plaid-link";
// OAuth banks bounce through the institution's site and return here with
// ?oauth_state_id=…; Link must then re-open with the SAME link token and the
// full return URL. sessionStorage carries both across the hop.
const OAUTH_KEY = "pennykingdom_oauth_link";

interface LinkedItem {
  id: string;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
}

interface PlaidHandler {
  open(): void;
}

declare global {
  interface Window {
    Plaid?: {
      create(options: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess: (publicToken: string, metadata: unknown) => void;
        onExit: (err: { display_message?: string; error_code?: string } | null) => void;
      }): PlaidHandler;
    };
  }
}

export default function CountingHouse() {
  const router = useRouter();
  const [items, setItems] = useState<LinkedItem[] | null>(null);
  const [message, setMessage] = useState("");
  // In-flight work: null | 'opening' (link token) | 'swearing' (exchange) |
  // 'surveying' (the census, up to ~30s). Anything non-null shows the spinner.
  const [busy, setBusy] = useState<null | "opening" | "swearing" | "surveying">(null);
  const [plaidReady, setPlaidReady] = useState(false);

  const api = useCallback(
    async (body?: Record<string, unknown>) => {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (jwt === undefined) {
        router.replace("/login");
        throw new Error("unauthenticated");
      }
      const res = await fetch(LINK_API, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return res.json();
    },
    [router],
  );

  const load = useCallback(async () => {
    const { items: linked } = await api();
    setItems(linked ?? []);
  }, [api]);

  const openLink = useCallback(
    (linkToken: string, updateItemId?: string, receivedRedirectUri?: string) => {
      if (window.Plaid === undefined) {
        setMessage("The Plaid scribes have not arrived yet — try again in a moment.");
        return;
      }
      const handler = window.Plaid.create({
        token: linkToken,
        ...(receivedRedirectUri === undefined ? {} : { receivedRedirectUri }),
        onSuccess: async (publicToken, metadata) => {
          sessionStorage.removeItem(OAUTH_KEY);
          const institution = (metadata as { institution?: { name?: string } | null }).institution;
          setBusy("swearing");
          setMessage("Swearing the oath…");
          if (updateItemId) await api({ action: "relinked", item_id: updateItemId });
          else
            await api({
              action: "exchange",
              public_token: publicToken,
              institution: institution?.name,
            });
          // Every new oath triggers an immediate census — no waiting for the
          // daily worker to see the first numbers.
          setBusy("surveying");
          setMessage("The royal surveyors are counting the vault — this takes a moment…");
          load();
          try {
            const { data } = await clients.api.POST("/api/v1/sync");
            const added =
              data?.reports.reduce((n: number, r: { added: number }) => n + r.added, 0) ?? 0;
            setMessage(
              `The census is complete — ${added} ledger line${added === 1 ? "" : "s"} recorded. The throne room awaits.`,
            );
          } catch {
            setMessage(
              "The vault is sworn, but the surveyors were delayed — the daily census will count it.",
            );
          } finally {
            setBusy(null);
          }
          load();
        },
        onExit: (err) => {
          sessionStorage.removeItem(OAUTH_KEY);
          setBusy(null);
          if (err) setMessage(`The envoy withdrew: ${err.display_message ?? err.error_code}`);
        },
      });
      handler.open();
    },
    [api, load],
  );

  async function start(updateItemId?: string) {
    if (busy !== null) return;
    setMessage("");
    setBusy("opening");
    setMessage("Summoning the envoy…");
    try {
      const r = await api({ action: "create_link_token", update_item_id: updateItemId });
      if (r.error) {
        setMessage(`Error: ${r.error}`);
        return;
      }
      sessionStorage.setItem(
        OAUTH_KEY,
        JSON.stringify({ link_token: r.link_token, update_item_id: updateItemId ?? null }),
      );
      setMessage("");
      openLink(r.link_token, updateItemId);
    } finally {
      // Plaid's modal takes over from here; onSuccess/onExit own the busy state.
      setBusy((b) => (b === "opening" ? null : b));
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Resume an OAuth hop once the Plaid script is available.
  useEffect(() => {
    if (!plaidReady) return;
    if (!new URLSearchParams(window.location.search).has("oauth_state_id")) return;
    const saved = sessionStorage.getItem(OAUTH_KEY);
    if (saved === null) {
      setMessage("The envoy returned without papers — start the linking again.");
      return;
    }
    const { link_token, update_item_id } = JSON.parse(saved) as {
      link_token: string;
      update_item_id: string | null;
    };
    openLink(link_token, update_item_id ?? undefined, window.location.href);
  }, [plaidReady, openLink]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        onReady={() => setPlaidReady(true)}
      />
      <header>
        <h1 className="font-serif text-2xl font-bold tracking-tight">🏦 The Counting House</h1>
        <p className="text-sm text-stone-500 dark:text-amber-200/60">
          Swear your vaults to the crown — the realm only counts what the banks attest.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/"
            className="text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
          >
            ← the throne room
          </Link>
        </p>
      </header>

      <section className="mt-6">
        <h2 className="font-serif text-lg font-semibold text-amber-900 dark:text-amber-200">
          Vaults sworn to the crown
        </h2>
        {items === null ? (
          <p className="mt-2 text-sm text-stone-500">The scribes are checking the rolls…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            None yet — the treasury awaits its first oath.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {items.map((i) => (
              <li key={i.id} className="text-sm">
                {i.institution_name} — {i.status}
                <button
                  type="button"
                  onClick={() => start(i.id)}
                  className="ml-2 text-amber-800 underline dark:text-amber-200"
                  title="Re-link to grant deeper records (rates, due dates)"
                >
                  renew the oath
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => start()}
        disabled={!plaidReady || busy !== null}
        className="mt-6 rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-700 disabled:opacity-50"
      >
        {busy === null ? "Link a bank" : "Working…"}
      </button>

      {message !== "" && (
        <p className="mt-4 flex items-center gap-2 text-sm" aria-live="polite">
          {busy !== null && (
            <span
              aria-hidden
              className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-amber-700 border-t-transparent dark:border-amber-300 dark:border-t-transparent"
            />
          )}
          {message}
        </p>
      )}
    </main>
  );
}
