import { useEffect, useState } from "react";
import type { ProductClients } from "./clients.js";
import type { Account, ApiEvent, DashboardData, MetricsView, Txn } from "./types.js";

export type DashboardState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

/** Session check + the four dashboard fetches, shared by every product. */
export function useDashboardData(clients: ProductClients): DashboardState {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await clients.supabase.auth.getSession();
      if (sessionData.session === null) {
        if (!cancelled) setState({ status: "unauthenticated" });
        return;
      }
      try {
        const [accounts, transactions, events, insights] = await Promise.all([
          clients.api.GET("/api/v1/accounts"),
          clients.api.GET("/api/v1/transactions"),
          clients.api.GET("/api/v1/events", { params: { query: { limit: 25 } } }),
          clients.api.GET("/api/v1/insights"),
        ]);
        if (cancelled) return;
        setState({
          status: "ready",
          data: {
            accounts: (accounts.data ?? []) as Account[],
            transactions: ((transactions.data ?? []) as Txn[]).slice(0, 15),
            events: (events.data ?? []) as ApiEvent[],
            metrics: (insights.data?.metrics ?? null) as MetricsView | null,
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
