import type { KingdomState } from "../model/types";

/**
 * Per-device "last seen" kingdom snapshot: the state this browser last
 * rendered — exactly the baseline "while you were away" should diff against.
 * (Multi-device: each device replays its own gap; a server-side last_seen_at
 * is the future upgrade — see CONTRACT.md.)
 */
const KEY = "kingdom_last_seen_state";

export function loadLastSeen(): KingdomState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as KingdomState;
    if (parsed.schemaVersion !== 1) return null; // contract changed — start fresh
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastSeen(state: KingdomState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full/blocked: the strip simply won't render next visit.
  }
}
