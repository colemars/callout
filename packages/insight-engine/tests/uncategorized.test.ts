import { isoDate, money } from "@platform/financial-core";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import { AS_OF, emptyState, txn } from "./fixtures.js";

const cfg = defaultEngineConfig;

// AS_OF = 2026-08-15: completed month = 2026-07.
const state = () =>
  emptyState({
    transactions: [
      txn({ postedAt: "2026-07-10", amountMinor: 150_00, category: "other" }),
      txn({ postedAt: "2026-07-20", amountMinor: -80_00, category: "other" }),
      txn({ postedAt: "2026-07-22", amountMinor: 400_00, category: "other", merchant: "vault" }),
      // Categorized rows never count.
      txn({ postedAt: "2026-07-05", amountMinor: -900_00, category: "groceries" }),
      // Wrong month never counts.
      txn({ postedAt: "2026-08-02", amountMinor: 999_00, category: "other", merchant: "aug" }),
    ],
  });

describe("uncategorized summary", () => {
  it("nets the completed month's 'other' flow as a magnitude", async () => {
    const m = computeMetrics(state(), cfg, AS_OF);
    expect(m.uncategorized.completedMonthCount).toBe(3);
    expect(m.uncategorized.completedMonthNet).toEqual(money(470_00)); // |150 - 80 + 400|
  });
});

describe("UNCATEGORIZED_FUNDS event", () => {
  it("fires once on the month roll when above threshold, silent otherwise", () => {
    const input = state();
    const july = computeMetrics(input, cfg, isoDate("2026-07-31"));
    const august = computeMetrics(input, cfg, isoDate("2026-08-01"));
    const events = deriveEvents(july, august, cfg);
    const hit = events.find((e) => e.type === "UNCATEGORIZED_FUNDS");
    expect(hit).toBeDefined();
    if (hit?.type === "UNCATEGORIZED_FUNDS") {
      expect(hit.month).toBe("2026-07");
      expect(hit.count).toBe(3);
      expect(hit.amount).toEqual(money(470_00));
    }

    // Same snapshot twice: silence (edge-triggered invariant).
    expect(deriveEvents(august, august, cfg)).toEqual([]);

    // Below threshold: silence.
    const quiet = emptyState({
      transactions: [txn({ postedAt: "2026-07-10", amountMinor: -50_00, category: "other" })],
    });
    const qJuly = computeMetrics(quiet, cfg, isoDate("2026-07-31"));
    const qAug = computeMetrics(quiet, cfg, isoDate("2026-08-01"));
    expect(deriveEvents(qJuly, qAug, cfg).some((e) => e.type === "UNCATEGORIZED_FUNDS")).toBe(
      false,
    );
  });

  it("survives a previous snapshot persisted before the field existed", () => {
    const input = state();
    const july = computeMetrics(input, cfg, isoDate("2026-07-31"));
    const august = computeMetrics(input, cfg, isoDate("2026-08-01"));
    const { uncategorized: _dropped, ...legacyCurrent } = august;
    expect(() => deriveEvents(july, legacyCurrent as unknown as typeof august, cfg)).not.toThrow();
  });
});
