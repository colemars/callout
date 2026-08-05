// The Influence economy (DESIGN.md "The earn table"): a pure, deterministic
// fold over the platform event ledger. Influence is EARNED by verified
// financial behavior, spent on cosmetics, and never purchasable. Everything
// here is dependency-free and replayable — same events, same balance, always.
//
// Ledger equation (roadmap): balance = foundingEndowment
//   + fold(events since epoch) + recordedQuestGrants − spends.
// The fold is always a FULL replay from the epoch cursor — at kingdom event
// volumes that is cheap, and a cache that can drift is worse than no cache.

import type { KingdomMetrics } from "./types";

export const META_SCHEMA_VERSION = 1;

/** The precious record (product_state key "kingdom-meta"). Writers CAS-retry. */
export interface KingdomMeta {
  metaSchemaVersion: number;
  epoch: {
    /** When this reign was founded (display only — never used for math). */
    foundedAt: string;
    /** Events with seq > epochSeq belong to this reign. THE epoch boundary. */
    epochSeq: number;
    /** Reigns abandoned before this one. */
    fleeCount: number;
  };
  /** Recorded at founding, never re-derived (history is finite). */
  endowment: {
    influence: number;
    grants: EndowmentGrant[];
  };
  /** Quest payouts recorded when granted (Phase D writes these). */
  questGrants: QuestGrant[];
  spends: SpendRecord[];
  /** Cosmetic item ids owned this reign. */
  unlocks: string[];
}

export interface EndowmentGrant {
  kind: string;
  influence: number;
  /** Human-readable proof of what was held at founding. */
  evidence: string;
}

export interface QuestGrant {
  questId: string;
  influence: number;
  at: string;
}

export interface SpendRecord {
  itemId: string;
  catalogVersion: number;
  influence: number;
  at: string;
}

/** What the fold consumes — the API's event rows, minimally. */
export interface LedgerEvent {
  seq: number;
  type: string;
  occurredOn: string;
  payload: Record<string, unknown>;
}

export interface GrantLine {
  /** Dedup identity within the epoch — one grant per key, ever. */
  key: string;
  influence: number;
  occurredOn: string;
  /** Kingdom-voice description for the Ledger of Deeds. */
  deed: string;
}

const asMinor = (v: unknown): number =>
  typeof v === "object" && v !== null && "amountMinor" in v
    ? Number((v as { amountMinor: unknown }).amountMinor) || 0
    : 0;
const usd = (minor: number): string =>
  (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The earn table. One-time grants (tiers, eliminations, completions) dedup
 * once-ever per key within the epoch; proportional grants dedup by natural
 * key (month / day / merchant). Events flagged accountSetChanged prove
 * nothing and earn nothing.
 */
const TIER_VALUES: Record<number, number> = { 1: 250, 3: 500, 6: 1000, 12: 2000 };
const RATE_VALUES: Record<number, number> = { 5: 250, 10: 500, 20: 1000, 30: 2000 };
export const DEBT_ELIMINATED_INFLUENCE = 1500;

function grantFor(e: LedgerEvent): GrantLine | null {
  const p = e.payload;
  if (p.accountSetChanged === true) return null;
  switch (e.type) {
    case "NET_CASH_FLOW_POSITIVE": {
      const surplus = asMinor(p.netFlow);
      const influence = Math.min(Math.floor(surplus / 100_00) * 10, 150);
      if (influence <= 0) return null;
      return {
        key: `flow:${String(p.month)}`,
        influence,
        occurredOn: e.occurredOn,
        deed: `A month in surplus — ${usd(surplus)} kept.`,
      };
    }
    case "HIGH_INTEREST_DEBT_DECREASED": {
      const delta = asMinor(p.delta);
      const influence = Math.min(Math.floor(delta / 100_00) * 20, 300);
      if (influence <= 0) return null;
      return {
        key: `debt:${e.occurredOn}`,
        influence,
        occurredOn: e.occurredOn,
        deed: `${usd(delta)} paid against the raiders' claim.`,
      };
    }
    case "DEBT_ELIMINATED":
      return {
        key: "debtgone",
        influence: DEBT_ELIMINATED_INFLUENCE,
        occurredOn: e.occurredOn,
        deed: "The raiders driven from the realm entirely.",
      };
    case "EMERGENCY_FUND_MILESTONE": {
      const tier = Number(p.tier);
      const influence = TIER_VALUES[tier] ?? 0;
      if (influence === 0) return null;
      return {
        key: `fund:${tier}`,
        influence,
        occurredOn: e.occurredOn,
        deed: `The granary reached ${tier} ${tier === 1 ? "month" : "months"} of stores.`,
      };
    }
    case "SAVINGS_RATE_MILESTONE": {
      const tierPct = Number(p.tierPct);
      const influence = RATE_VALUES[tierPct] ?? 0;
      if (influence === 0) return null;
      return {
        key: `rate:${tierPct}`,
        influence,
        occurredOn: e.occurredOn,
        deed: `The crown now keeps ${tierPct} of every hundred coins.`,
      };
    }
    case "UNDER_BUDGET_STREAK": {
      const months = Number(p.months) || 0;
      const influence = Math.min(months * 50, 300);
      if (influence <= 0) return null;
      return {
        key: `streak:${String(p.month)}`,
        influence,
        occurredOn: e.occurredOn,
        deed: `${months} months running, every decree held.`,
      };
    }
    case "RECURRING_EXPENSE_REMOVED":
      return {
        key: `tithe:${String(p.merchant)}`,
        influence: 100,
        occurredOn: e.occurredOn,
        deed: `The tithe to ${String(p.merchant)} lifted from the realm.`,
      };
    case "GOAL_COMPLETED":
      return {
        key: `oath:${String(p.goalId)}`,
        influence: 500,
        occurredOn: e.occurredOn,
        deed: "An oath sworn and fulfilled.",
      };
    default:
      return null;
  }
}

export interface FoldResult {
  influence: number;
  grants: GrantLine[];
}

/** Pure fold: events at seq > epochSeq, first grant per key wins. */
export function foldInfluence(events: readonly LedgerEvent[], epochSeq: number): FoldResult {
  const seen = new Set<string>();
  const grants: GrantLine[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.seq <= epochSeq) continue;
    const grant = grantFor(e);
    if (grant === null || seen.has(grant.key)) continue;
    seen.add(grant.key);
    grants.push(grant);
  }
  return { influence: grants.reduce((sum, g) => sum + g.influence, 0), grants };
}

/**
 * The founding endowment: currently-HELD state-based milestones granted at
 * reduced value — "your reputation precedes you; deeds earn more." Streaks,
 * completions, and proportional grants never endow. Recorded once with
 * evidence; never re-derived.
 */
const ENDOWMENT_RATE = 0.25;

export function computeEndowment(metrics: KingdomMetrics | null): KingdomMeta["endowment"] {
  const grants: EndowmentGrant[] = [];
  if (metrics !== null) {
    const runway = metrics.emergencyRunwayMonths ?? null;
    if (runway !== null) {
      for (const [tier, value] of Object.entries(TIER_VALUES)) {
        if (runway >= Number(tier)) {
          grants.push({
            kind: `fund:${tier}`,
            influence: Math.round(value * ENDOWMENT_RATE),
            evidence: `runway ${runway} months at founding`,
          });
        }
      }
    }
    const rate = metrics.savingsRate?.pct ?? null;
    if (rate !== null) {
      for (const [tierPct, value] of Object.entries(RATE_VALUES)) {
        if (rate >= Number(tierPct)) {
          grants.push({
            kind: `rate:${tierPct}`,
            influence: Math.round(value * ENDOWMENT_RATE),
            evidence: `savings rate ${rate}% at founding`,
          });
        }
      }
    }
    const debt = metrics.totalHighInterestDebt?.amountMinor ?? null;
    if (debt === 0) {
      grants.push({
        kind: "debtgone",
        influence: Math.round(DEBT_ELIMINATED_INFLUENCE * ENDOWMENT_RATE),
        evidence: "no high-interest debt at founding",
      });
    }
  }
  return { influence: grants.reduce((sum, g) => sum + g.influence, 0), grants };
}

/** A fresh reign, founded on the given event cursor. */
export function foundMeta(
  epochSeq: number,
  metrics: KingdomMetrics | null,
  foundedAt: string,
  fleeCount = 0,
): KingdomMeta {
  return {
    metaSchemaVersion: META_SCHEMA_VERSION,
    epoch: { foundedAt, epochSeq, fleeCount },
    endowment: computeEndowment(metrics),
    questGrants: [],
    spends: [],
    unlocks: [],
  };
}

/** Balance per the ledger equation. Never negative (spends are gated). */
export function influenceBalance(meta: KingdomMeta, fold: FoldResult): number {
  const quests = meta.questGrants.reduce((sum, q) => sum + q.influence, 0);
  const spent = meta.spends.reduce((sum, s) => sum + s.influence, 0);
  return Math.max(0, meta.endowment.influence + fold.influence + quests - spent);
}

// ---------------------------------------------------------------------------
// The spend catalog: versioned so old spend records stay auditable forever.
// Cosmetics only — never gameplay-relevant, never real money (DESIGN.md).
// ---------------------------------------------------------------------------

export const CATALOG_VERSION = 1;

export interface CatalogItem {
  id: string;
  name: string;
  /** Emoji shown beside the kingdom's name (banners) — or "" for titles. */
  emblem: string;
  /** Court title appended to the crown's style — or "" for banners. */
  title: string;
  price: number;
  flavor: string;
}

export const SPEND_CATALOG: readonly CatalogItem[] = [
  {
    id: "banner-crimson",
    name: "Crimson Banner",
    emblem: "🚩",
    title: "",
    price: 200,
    flavor: "A bold standard over the gatehouse.",
  },
  {
    id: "banner-gilded",
    name: "Gilded Banner",
    emblem: "🏳️‍🌈",
    title: "",
    price: 500,
    flavor: "Thread-of-gold, visible from the far fields.",
  },
  {
    id: "title-thrifty",
    name: "Style: the Thrifty",
    emblem: "",
    title: "the Thrifty",
    price: 300,
    flavor: "Whispered with respect in the market square.",
  },
  {
    id: "title-debtslayer",
    name: "Style: Debtslayer",
    emblem: "",
    title: "Debtslayer",
    price: 1000,
    flavor: "The raiders know this name.",
  },
];

/** Apply a purchase; null when unaffordable, unknown, or already owned. */
export function purchase(
  meta: KingdomMeta,
  itemId: string,
  balance: number,
  at: string,
): KingdomMeta | null {
  const item = SPEND_CATALOG.find((i) => i.id === itemId);
  if (item === undefined || meta.unlocks.includes(itemId) || balance < item.price) return null;
  return {
    ...meta,
    spends: [
      ...meta.spends,
      { itemId, catalogVersion: CATALOG_VERSION, influence: item.price, at },
    ],
    unlocks: [...meta.unlocks, itemId],
  };
}
