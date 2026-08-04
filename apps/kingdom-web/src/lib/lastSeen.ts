import type { KingdomState } from "../model/types";

/**
 * Per-device, per-user "last seen" kingdom snapshot: the state this browser
 * last rendered for this user — the baseline "while you were away" diffs
 * against. Keyed by user so switching accounts never replays someone else's
 * kingdom. (Multi-device: each device replays its own gap; a server-side
 * last_seen_at is the future upgrade — see CONTRACT.md.)
 */
const KEY = "kingdom_last_seen_state";

interface StoredLastSeen {
  schemaVersion: 1;
  userId: string;
  savedAt: number; // epoch ms
  state: KingdomState;
}

export interface LastSeen {
  readonly state: KingdomState;
  readonly savedAt: number;
}

export function loadLastSeen(userId: string): LastSeen | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLastSeen>;
    // Legacy entries stored the bare KingdomState with no owner — discard.
    if (parsed.schemaVersion !== 1 || parsed.state === undefined) return null;
    if (parsed.userId !== userId || typeof parsed.savedAt !== "number") return null;
    if (parsed.state.schemaVersion !== 1) return null; // contract changed — start fresh
    return { state: parsed.state, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function saveLastSeen(userId: string, state: KingdomState): void {
  try {
    const stored: StoredLastSeen = { schemaVersion: 1, userId, savedAt: Date.now(), state };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage full/blocked: the strip simply won't render next visit.
  }
}
