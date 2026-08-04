import { describe, expect, it } from "vitest";
import { REPLAY_MIN_GAP_MS, shouldReplay } from "../src/lib/serverLastSeen";

describe("shouldReplay", () => {
  const now = Date.parse("2026-08-05T12:00:00Z");

  it("stays silent on same-day revisits", () => {
    expect(shouldReplay(now - 5 * 60 * 1000, now)).toBe(false);
    expect(shouldReplay(now - REPLAY_MIN_GAP_MS + 1, now)).toBe(false);
  });

  it("replays after a real absence", () => {
    expect(shouldReplay(now - REPLAY_MIN_GAP_MS, now)).toBe(true);
    expect(shouldReplay(now - 3 * 24 * 60 * 60 * 1000, now)).toBe(true);
  });
});
