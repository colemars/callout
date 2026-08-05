// The Kingdom Council (DESIGN.md "Quests"): advisors propose weekly counsel,
// the crown backs what it will pursue, and completion is judged by testable
// oracles against real metrics and the event ledger — never by trust.
//
// Rules (roadmap Phase D):
// - Proposals are PERSISTED per UTC ISO week: the first device to open in a
//   new week generates them; every other device reads what was stored.
// - Every proposal template declares a completion oracle at design time.
//   Baselines are pinned at BACKING (immune to later edits); debt quests
//   verify by summing HIGH_INTEREST_DEBT_DECREASED deltas over the window.
// - Checked eagerly on every open; grants recorded immediately, never
//   re-derived. Expiry carries no penalty. Active quests survive the weekly
//   regeneration; resolved ones chronicle briefly, then compact.

import { monthName } from "./derive";
import type { KingdomMeta, LedgerEvent } from "./economy";
import type { KingdomMetrics } from "./types";

/**
 * The meta record with the council's chamber. Kept as an extension (not a
 * field on KingdomMeta itself) so economy.ts never imports council code:
 * spreads in every meta op carry the field through untouched, foundMeta omits
 * it — so a flee dissolves the council with the reign — and the schema
 * version is unchanged (unknown-field-preserving clients need no migration).
 */
export interface KingdomMetaWithCouncil extends KingdomMeta {
  council?: CouncilState;
}

export type AdvisorId = "treasurer" | "builder" | "captain" | "guildmaster";

export const ADVISORS: Record<AdvisorId, { name: string; icon: string }> = {
  treasurer: { name: "The Treasurer", icon: "🪙" },
  builder: { name: "The Master Builder", icon: "🏗️" },
  captain: { name: "The Captain of the Guard", icon: "⚔️" },
  guildmaster: { name: "The Guildmaster", icon: "🐪" },
};

/** Metric-or-ledger-verified completion conditions. Params pinned at backing. */
export type Oracle =
  | { kind: "debt_paydown"; targetMinor: number }
  | { kind: "runway_reach"; targetMonths: number }
  | { kind: "tithe_dropped" }
  | { kind: "caravan_sent" };

export interface CouncilProposal {
  id: string;
  advisor: AdvisorId;
  title: string;
  charge: string;
  reward: number;
  oracle: Oracle;
}

export interface Quest extends CouncilProposal {
  backedAt: string;
  expiresOn: string;
  /** Ledger events with seq > baselineSeq form this quest's window. */
  baselineSeq: number;
}

export interface ResolvedQuest {
  id: string;
  advisor: AdvisorId;
  title: string;
  outcome: "fulfilled" | "lapsed";
  on: string;
  reward: number;
}

export interface CouncilState {
  week: string;
  proposals: CouncilProposal[];
  active: Quest[];
  resolved: ResolvedQuest[];
}

/** Days a backed quest has before it lapses (without penalty). */
export const QUEST_DAYS = 28;
/** Resolved quests chronicle briefly, then compact. */
const RESOLVED_KEEP = 6;
const RESOLVED_KEEP_DAYS = 14;

const usd = (minor: number): string =>
  (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** UTC ISO-8601 week, e.g. "2026-W32". */
export function isoWeekOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // the week's Thursday fixes the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Thu = new Date(jan4);
  week1Thu.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - week1Thu.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Small deterministic hash — the week seed only flavors phrasing. */
function seedOf(week: string): number {
  let hash = 0;
  for (let i = 0; i < week.length; i++) hash = (hash * 31 + week.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

const pick = (seed: number, variants: readonly string[]): string =>
  variants[seed % variants.length] as string;

/**
 * The weekly slate: each advisor speaks only when the data supports a
 * testable charge. 2-4 proposals; an advisor with nothing verifiable to ask
 * stays silent this week.
 */
export function generateProposals(week: string, metrics: KingdomMetrics | null): CouncilProposal[] {
  if (metrics === null) return [];
  const seed = seedOf(week);
  const proposals: CouncilProposal[] = [];

  const debt = metrics.totalHighInterestDebt?.amountMinor ?? 0;
  if (debt > 0) {
    // 5% of the debt, clamped to [$100, $1,000], rounded to $50.
    const targetMinor = Math.min(
      Math.max(Math.round((debt * 0.05) / 50_00) * 50_00, 100_00),
      1_000_00,
    );
    proposals.push({
      id: `${week}:captain`,
      advisor: "captain",
      title: pick(seed, [
        "The raiders test our walls",
        "Drive the raiders back",
        "The moneylenders grow bold",
      ]),
      charge: `Pay ${usd(targetMinor)} against the high-interest debt before the quest lapses.`,
      reward: 250,
      oracle: { kind: "debt_paydown", targetMinor },
    });
  }

  const runway = metrics.emergencyRunwayMonths ?? null;
  if (runway !== null && runway > 0) {
    // The next tier if it's near, else half a month further — always reachable.
    const tiers = [1, 3, 6, 12];
    const nextTier = tiers.find((t) => t > runway);
    const targetMonths =
      nextTier !== undefined && nextTier - runway <= 1
        ? nextTier
        : Math.round((runway + 0.5) * 10) / 10;
    proposals.push({
      id: `${week}:treasurer`,
      advisor: "treasurer",
      title: pick(seed + 1, [
        "Deepen the granary",
        "Against the lean months",
        "Stores for a longer siege",
      ]),
      charge: `Raise the granary to ${targetMonths} months of stores (now ${runway}).`,
      reward: 200,
      oracle: { kind: "runway_reach", targetMonths },
    });
  }

  if ((metrics.recurringCandidates ?? []).length > 0) {
    proposals.push({
      id: `${week}:builder`,
      advisor: "builder",
      title: pick(seed + 2, [
        "Too many standing tithes",
        "Prune the monthly tithes",
        "The tithe rolls grow long",
      ]),
      charge: "Cancel one recurring charge — the surveyors will see the tithe lifted.",
      reward: 200,
      oracle: { kind: "tithe_dropped" },
    });
  }

  const contributions =
    (metrics.investments?.contributionsCompletedMonth?.amountMinor ?? 0) +
    (metrics.investments?.contributionsPriorMonth?.amountMinor ?? 0);
  if (contributions > 0) {
    proposals.push({
      id: `${week}:guildmaster`,
      advisor: "guildmaster",
      title: pick(seed + 3, [
        "Send a caravan to the Treasury",
        "The vaults await their tribute",
        "Keep the caravans moving",
      ]),
      charge: "Make a retirement contribution — the caravan must reach the Royal Treasury.",
      reward: 200,
      oracle: { kind: "caravan_sent" },
    });
  }

  return proposals;
}

const asMinor = (v: unknown): number =>
  typeof v === "object" && v !== null && "amountMinor" in v
    ? Number((v as { amountMinor: unknown }).amountMinor) || 0
    : 0;

export interface OracleReading {
  done: boolean;
  /** Progress line for the quest tracker, kingdom voice. */
  progress: string;
}

/**
 * Judge a backed quest against live metrics and its ledger window. The
 * window is bounded on BOTH ends: after the pinned baseline, and dated
 * within the quest's term — evidence from after expiry proves nothing about
 * the quest, however late it is discovered.
 */
export function readOracle(
  quest: Quest,
  metrics: KingdomMetrics | null,
  events: readonly LedgerEvent[],
): OracleReading {
  const window = events.filter((e) => e.seq > quest.baselineSeq && e.occurredOn <= quest.expiresOn);
  switch (quest.oracle.kind) {
    case "debt_paydown": {
      // Only unflagged decreases count — an unlinked card proves nothing.
      const paid = window
        .filter(
          (e) => e.type === "HIGH_INTEREST_DEBT_DECREASED" && e.payload.accountSetChanged !== true,
        )
        .reduce((sum, e) => sum + asMinor(e.payload.delta), 0);
      const target = quest.oracle.targetMinor;
      return {
        done: paid >= target,
        progress:
          paid > 0
            ? `${usd(paid)} of ${usd(target)} paid so far`
            : `nothing paid yet of ${usd(target)}`,
      };
    }
    case "runway_reach": {
      const runway = metrics?.emergencyRunwayMonths ?? null;
      const target = quest.oracle.targetMonths;
      return {
        done: runway !== null && runway >= target,
        progress:
          runway === null ? "the granary is unmeasured" : `${runway} of ${target} months in store`,
      };
    }
    case "tithe_dropped": {
      const dropped = window.find((e) => e.type === "RECURRING_EXPENSE_REMOVED");
      return {
        done: dropped !== undefined,
        progress:
          dropped !== undefined
            ? `the tithe to ${String(dropped.payload.merchant)} is lifted`
            : "no tithe lifted yet",
      };
    }
    case "caravan_sent": {
      const arrived = window.find((e) => e.type === "RETIREMENT_CONTRIBUTION_MADE");
      return {
        done: arrived !== undefined,
        progress:
          arrived !== undefined
            ? `a caravan arrived in ${monthName(String(arrived.payload.month))}`
            : "no caravan on the road yet",
      };
    }
  }
}

export interface CouncilAdvance {
  council: CouncilState;
  /** Grants earned this advance — recorded by the caller, never re-derived. */
  grants: { questId: string; influence: number; at: string }[];
  changed: boolean;
}

const plusDays = (dateIso: string, days: number): string => {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * One pure council turn: judge active quests (fulfill or lapse), roll the
 * weekly slate, compact old resolutions. `grantedIds` guards against paying
 * a quest twice when a CAS retry replays the advance on fresher meta.
 */
export function advanceCouncil(
  council: CouncilState | undefined,
  week: string,
  metrics: KingdomMetrics | null,
  events: readonly LedgerEvent[],
  todayIso: string,
  grantedIds: ReadonlySet<string>,
): CouncilAdvance {
  const base: CouncilState = council ?? { week: "", proposals: [], active: [], resolved: [] };
  const grants: CouncilAdvance["grants"] = [];
  const stillActive: Quest[] = [];
  const newlyResolved: ResolvedQuest[] = [];

  for (const quest of base.active) {
    const reading = readOracle(quest, metrics, events);
    const expired = todayIso > quest.expiresOn;
    // Ledger oracles carry dated evidence, so a fulfillment discovered after
    // expiry still counts (readOracle bounds the window to the term). The
    // runway oracle judges LIVE metrics — undated — so once expired it can
    // only lapse.
    const fulfilled = reading.done && !(expired && quest.oracle.kind === "runway_reach");
    if (fulfilled) {
      newlyResolved.push({
        id: quest.id,
        advisor: quest.advisor,
        title: quest.title,
        outcome: "fulfilled",
        on: todayIso,
        reward: quest.reward,
      });
      if (!grantedIds.has(quest.id)) {
        grants.push({ questId: quest.id, influence: quest.reward, at: todayIso });
      }
    } else if (expired) {
      newlyResolved.push({
        id: quest.id,
        advisor: quest.advisor,
        title: quest.title,
        outcome: "lapsed",
        on: todayIso,
        reward: 0,
      });
    } else {
      stillActive.push(quest);
    }
  }

  // The week rolls only with metrics in hand — a briefly-unmeasured open in
  // a new week must not replace the stored slate with silence.
  const weekRolled = base.week !== week && metrics !== null;
  const resolved = [...newlyResolved, ...base.resolved]
    .filter((r) => plusDays(r.on, RESOLVED_KEEP_DAYS) >= todayIso)
    .slice(0, RESOLVED_KEEP);

  const next: CouncilState = {
    week: weekRolled ? week : base.week,
    // An advisor whose earlier quest is still running stays silent: one
    // behavior must never fulfill two overlapping charges.
    proposals: weekRolled
      ? generateProposals(week, metrics).filter(
          (p) => !stillActive.some((q) => q.advisor === p.advisor),
        )
      : base.proposals,
    active: stillActive,
    resolved,
  };

  const changed =
    weekRolled || newlyResolved.length > 0 || resolved.length !== base.resolved.length;
  return { council: next, grants, changed };
}

/**
 * Back a proposal: it becomes a quest with its baseline pinned NOW — the
 * event cursor for ledger-window oracles, a 28-day term, no penalty for
 * failure. Null when the proposal is gone (another device already acted).
 */
export function backProposal(
  council: CouncilState,
  proposalId: string,
  baselineSeq: number,
  todayIso: string,
): CouncilState | null {
  const proposal = council.proposals.find((p) => p.id === proposalId);
  if (proposal === undefined) return null;
  if (council.active.some((q) => q.id === proposalId)) return null;
  const quest: Quest = {
    ...proposal,
    backedAt: todayIso,
    expiresOn: plusDays(todayIso, QUEST_DAYS),
    baselineSeq,
  };
  return {
    ...council,
    proposals: council.proposals.filter((p) => p.id !== proposalId),
    active: [...council.active, quest],
  };
}
