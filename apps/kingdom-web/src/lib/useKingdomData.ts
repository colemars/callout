import type { ApiEvent, ProductClients } from "@platform/ui";
import { useEffect, useState } from "react";
import type {
  KingdomAccount,
  KingdomInput,
  KingdomInvestmentActivity,
  KingdomMetrics,
  KingdomTxn,
} from "../model/types";

export type KingdomDataState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; input: KingdomInput };

/**
 * Kingdom's own data hook: wider than the shared dashboard hook — full
 * transaction window (fire detection + chronicle need ~70 days) and the
 * widened account/metric types the API already serves.
 */
export function useKingdomData(clients: ProductClients): KingdomDataState {
  const [state, setState] = useState<KingdomDataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await clients.supabase.auth.getSession();
      if (sessionData.session === null) {
        if (!cancelled) setState({ status: "unauthenticated" });
        return;
      }
      try {
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
        const [accounts, transactions, activity, events, insights] = await Promise.all([
          clients.api.GET("/api/v1/accounts"),
          clients.api.GET("/api/v1/transactions", { params: { query: { from } } }),
          clients.api.GET("/api/v1/investments/activity", { params: { query: { from } } }),
          clients.api.GET("/api/v1/events", { params: { query: { limit: 25 } } }),
          clients.api.GET("/api/v1/insights"),
        ]);
        if (cancelled) return;
        setState({
          status: "ready",
          input: {
            accounts: (accounts.data ?? []) as KingdomAccount[],
            transactions: (transactions.data ?? []) as KingdomTxn[],
            investmentActivity: (activity.data ?? []) as KingdomInvestmentActivity[],
            events: (events.data ?? []) as ApiEvent[],
            metrics: (insights.data?.metrics ?? null) as KingdomMetrics | null,
            today,
          },
        });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clients]);

  return state;
}
