import type { Category, Transaction } from "@platform/financial-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/compute.js";
import { defaultEngineConfig } from "../src/config.js";
import { deriveEvents } from "../src/events.js";
import { AS_OF, emptyState, txn } from "./fixtures.js";

const cfg = defaultEngineConfig;

const CATEGORY_POOL: readonly Category[] = [
  "dining",
  "groceries",
  "housing",
  "income",
  "transfer",
  "other",
];

const arbTransaction = fc
  .record({
    month: fc.constantFrom("2026-06", "2026-07", "2026-08"),
    day: fc.integer({ min: 1, max: 28 }),
    amountMinor: fc.integer({ min: -500_000, max: 500_000 }).filter((n) => n !== 0),
    category: fc.constantFrom(...CATEGORY_POOL),
    merchant: fc.constantFrom("A", "B", "C", undefined),
    pending: fc.boolean(),
    salt: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .map(({ month, day, amountMinor, category, merchant, pending, salt }) =>
    txn({
      postedAt: `${month}-${String(day).padStart(2, "0")}`,
      amountMinor,
      category,
      pending,
      sourceTxnId: `prop-${salt}-${month}-${day}-${amountMinor}`,
      ...(merchant === undefined ? {} : { merchant }),
    }),
  );

const arbTransactions = fc.array(arbTransaction, { maxLength: 50 });

describe("engine properties", () => {
  it("is pure: identical inputs produce deeply identical outputs", () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const state = emptyState({ transactions });
        expect(computeMetrics(state, cfg, AS_OF)).toEqual(computeMetrics(state, cfg, AS_OF));
      }),
    );
  });

  it("is order-independent: shuffling transactions never changes the output", () => {
    fc.assert(
      fc.property(
        arbTransactions.chain((txns) =>
          fc.tuple(fc.constant(txns), fc.shuffledSubarray(txns, { minLength: txns.length })),
        ),
        ([original, shuffled]) => {
          expect(computeMetrics(emptyState({ transactions: shuffled }), cfg, AS_OF)).toEqual(
            computeMetrics(emptyState({ transactions: original }), cfg, AS_OF),
          );
        },
      ),
    );
  });

  it("deriveEvents(m, m) === [] for any state", () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const m = computeMetrics(emptyState({ transactions }), cfg, AS_OF);
        expect(deriveEvents(m, m, cfg)).toEqual([]);
      }),
    );
  });

  it("adding an inflow never decreases MTD net cash flow", () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.integer({ min: 1, max: 100_000 }),
        (transactions, inflowMinor) => {
          const before = computeMetrics(emptyState({ transactions }), cfg, AS_OF);
          const withInflow: Transaction[] = [
            ...transactions,
            txn({
              postedAt: "2026-08-10",
              amountMinor: inflowMinor,
              category: "income",
              sourceTxnId: `extra-inflow-${inflowMinor}`,
            }),
          ];
          const after = computeMetrics(emptyState({ transactions: withInflow }), cfg, AS_OF);
          expect(after.mtd.netCashFlow.amountMinor).toBeGreaterThanOrEqual(
            before.mtd.netCashFlow.amountMinor,
          );
        },
      ),
    );
  });
});
