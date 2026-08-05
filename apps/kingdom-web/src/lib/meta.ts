import type { ProductClients } from "@platform/ui";
import {
  type KingdomMeta,
  type LedgerEvent,
  META_SCHEMA_VERSION,
  foundMeta,
} from "../model/economy";
import type { KingdomMetrics } from "../model/types";

type ApiClient = ProductClients["api"];

/**
 * The precious record (product_state "kingdom-meta"): epoch, endowment,
 * spends, unlocks. Unlike the churny "kingdom" last-seen blob, every write
 * here is CAS-with-retry, and a client that sees a NEWER schema version than
 * it understands refuses to write — discarding an unknown field is safe for
 * lastSeen but would destroy spends.
 */
export interface LoadedMeta {
  meta: KingdomMeta;
  version: number | undefined;
  /** True when the stored schema is newer than this client understands. */
  readOnly: boolean;
}

function migrate(raw: Record<string, unknown>): KingdomMeta | "newer" | null {
  const v = raw.metaSchemaVersion;
  if (typeof v !== "number" || v < 1) return null;
  if (v > META_SCHEMA_VERSION) return "newer";
  // v === 1 — current. Future versions forward-migrate here, step by step.
  return raw as unknown as KingdomMeta;
}

/**
 * Load the meta record; when none exists, found the kingdom now: epoch cursor
 * at the newest event (history before founding is covered by the endowment,
 * never re-earned) and the endowment evaluated from the founding metrics.
 */
export async function loadOrFoundMeta(
  api: ApiClient,
  metrics: KingdomMetrics | null,
): Promise<LoadedMeta> {
  const { data, response } = await api.GET("/api/v1/products/{product}/state", {
    params: { path: { product: "kingdom-meta" } },
  });
  if (response.status !== 404 && data !== undefined) {
    const parsed = migrate(data.data as Record<string, unknown>);
    if (parsed === "newer") {
      return {
        meta: data.data as unknown as KingdomMeta,
        version: data.version,
        readOnly: true,
      };
    }
    if (parsed !== null) return { meta: parsed, version: data.version, readOnly: false };
    // Malformed blob: fall through and re-found rather than crash the room.
  }
  const events = await fetchEventsSince(api, 0);
  const epochSeq = events.length > 0 ? Math.max(...events.map((e) => e.seq)) : 0;
  const meta = foundMeta(epochSeq, metrics, new Date().toISOString());
  const version = await writeMeta(api, meta, undefined);
  return { meta, version, readOnly: version === undefined };
}

/** Raw CAS write; returns the new version, or undefined on conflict/failure. */
async function writeMeta(
  api: ApiClient,
  meta: KingdomMeta,
  baseVersion: number | undefined,
): Promise<number | undefined> {
  const { data, response } = await api.PUT("/api/v1/products/{product}/state", {
    params: { path: { product: "kingdom-meta" } },
    body: {
      data: meta as unknown as Record<string, unknown>,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    },
  });
  if (response.status !== 200 || data === undefined) return undefined;
  return data.version;
}

/**
 * CAS update: apply `op` to the freshest meta and write with its version.
 * On a 409 (another device wrote first) refetch, re-apply, retry — the op is
 * a pure function so replaying it on fresher state is always safe. A client
 * that finds a newer schema mid-retry aborts (write refusal).
 */
export async function updateMeta(
  api: ApiClient,
  loaded: LoadedMeta,
  op: (meta: KingdomMeta) => KingdomMeta | null,
): Promise<LoadedMeta | null> {
  if (loaded.readOnly) return null;
  let current = loaded;
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = op(current.meta);
    if (next === null) return null;
    const version = await writeMeta(api, next, current.version);
    if (version !== undefined) return { meta: next, version, readOnly: false };
    const { data, response } = await api.GET("/api/v1/products/{product}/state", {
      params: { path: { product: "kingdom-meta" } },
    });
    if (response.status === 404 || data === undefined) return null;
    const parsed = migrate(data.data as Record<string, unknown>);
    if (parsed === null || parsed === "newer") return null;
    current = { meta: parsed, version: data.version, readOnly: false };
  }
  return null;
}

/** Every event with seq > sinceSeq, ascending — exact-cursor pages of 200. */
export async function fetchEventsSince(api: ApiClient, sinceSeq: number): Promise<LedgerEvent[]> {
  const all: LedgerEvent[] = [];
  let cursor = sinceSeq;
  for (let page = 0; page < 50; page++) {
    const { data } = await api.GET("/api/v1/events", {
      params: { query: { sinceSeq: cursor, limit: 200 } },
    });
    const rows = (data ?? []) as LedgerEvent[];
    all.push(...rows);
    if (rows.length < 200) break;
    cursor = Math.max(...rows.map((r) => r.seq));
  }
  return all;
}

/**
 * Flee the kingdom: a NEW reign founded on the newest event cursor. Spends,
 * unlocks, and quest grants die with the old reign; a fresh (reduced)
 * endowment is struck from today's metrics. Nothing crosses foundedAt — that
 * invariant is what makes repeated fleeing pointless. Real financial data is
 * untouched: you cannot flee your debts.
 */
export async function fleeKingdom(
  api: ApiClient,
  loaded: LoadedMeta,
  metrics: KingdomMetrics | null,
): Promise<LoadedMeta | null> {
  const events = await fetchEventsSince(api, loaded.meta.epoch.epochSeq);
  const newest =
    events.length > 0 ? Math.max(...events.map((e) => e.seq)) : loaded.meta.epoch.epochSeq;
  const result = await updateMeta(api, loaded, (meta) =>
    foundMeta(newest, metrics, new Date().toISOString(), meta.epoch.fleeCount + 1),
  );
  if (result === null) return null;
  // Clear the last-seen baseline too: a fresh reign has no replay wall.
  await api
    .PUT("/api/v1/products/{product}/state", {
      params: { path: { product: "kingdom" } },
      body: { data: {} },
    })
    .catch(() => {});
  return result;
}
