import type { ProductClients } from "@platform/ui";
import type { KingdomState } from "../model/types";

type ApiClient = ProductClients["api"];

/**
 * Server-held "last seen" kingdom baseline (platform product_state, product
 * 'kingdom'): the state the user last acknowledged on ANY device — "while you
 * were away" means away from the kingdom, not away from this browser.
 */
export interface ServerLastSeen {
  readonly version: number;
  readonly lastSeenAt: number; // epoch ms
  readonly state: KingdomState;
}

/** Replay only when the user was actually away, not on a same-day revisit. */
export const REPLAY_MIN_GAP_MS = 24 * 60 * 60 * 1000;

export function shouldReplay(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt >= REPLAY_MIN_GAP_MS;
}

export async function fetchLastSeen(api: ApiClient): Promise<ServerLastSeen | null> {
  const { data, response } = await api.GET("/api/v1/products/{product}/state", {
    params: { path: { product: "kingdom" } },
  });
  if (response.status === 404 || data === undefined) return null;
  const blob = data.data as { lastSeenAt?: unknown; lastSeen?: KingdomState };
  const savedAt = typeof blob.lastSeenAt === "string" ? Date.parse(blob.lastSeenAt) : Number.NaN;
  // Defensive: the blob is opaque jsonb — validate before trusting it.
  if (Number.isNaN(savedAt) || blob.lastSeen?.schemaVersion !== 1) return null;
  return { version: data.version, lastSeenAt: savedAt, state: blob.lastSeen };
}

/** Advances the baseline; a 409 (another device won the race) is fine to ignore. */
export async function saveLastSeen(
  api: ApiClient,
  state: KingdomState,
  baseVersion?: number,
): Promise<void> {
  await api.PUT("/api/v1/products/{product}/state", {
    params: { path: { product: "kingdom" } },
    body: {
      data: { lastSeenAt: new Date().toISOString(), lastSeen: state },
      ...(baseVersion === undefined ? {} : { baseVersion }),
    },
  });
}
