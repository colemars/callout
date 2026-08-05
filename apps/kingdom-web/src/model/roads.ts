// The Roads: financial traffic. Every recurring financial event is a traveler
// approaching the kingdom with an ETA — subscriptions, bills, bank due dates,
// and (when the surveyors can trace them) payroll wagons. A Road Registry
// lets the crown name each visitor's role; every default is NEUTRAL —
// hostility is assigned only by decree, never presumed (no guilt framing).
// The emotional question this surface asks: "does this visitor deserve a
// permanent road into my kingdom?" — not "should I cut this?".
//
// Prime Rule discipline: every ETA traces to a real fact (an observed
// charge cadence or a bank-reported due date). Merchants below the
// recurrence threshold are ABSENT, never estimated. Pure module — the model
// never reads a clock; all ETAs derive from input.today.
//
// (The word "caravan" is deliberately never used here — it already means
// brokerage holdings and retirement contributions elsewhere in the kingdom.)

import type { ApiMoney } from "@platform/ui";
import { classifyAccount, daysUntil, fmtMinor, monthName, plusDays } from "./derive";
import type { KingdomMeta } from "./economy";
import type { KingdomInput } from "./types";

export const ROLE_CATALOG_VERSION = 1;

/** After this many days past an expected arrival, a quiet road leaves the
 * list — RECURRING_EXPENSE_REMOVED will chronicle the ending; no nagging. */
export const QUIET_GRACE_DAYS = 10;

export type TravelerTone = "friendly" | "neutral" | "hostile";

export type RoleId =
  | "visitor"
  | "players"
  | "guard"
  | "taxcollector"
  | "collectors"
  | "lamplighters"
  | "quartermaster"
  | "courier"
  | "healer"
  | "provisioner"
  | "loansharks"
  | "parasite"
  | "honored";

export interface RoadRole {
  id: RoleId;
  name: string;
  icon: string;
  tone: TravelerTone;
  /** One-line registry description. */
  charge: string;
  /** Only the crown bestows it — never a default heuristic. */
  byDecreeOnly?: boolean;
}

export const ROLE_CATALOG: readonly RoadRole[] = [
  {
    id: "visitor",
    name: "A Visitor",
    icon: "🧳",
    tone: "neutral",
    charge: "a regular caller, purpose unnamed",
  },
  {
    id: "players",
    name: "The Traveling Players",
    icon: "🎭",
    tone: "neutral",
    charge: "entertainment for the court",
  },
  {
    id: "guard",
    name: "The City Guard",
    icon: "🛡️",
    tone: "neutral",
    charge: "protection, paid in advance",
  },
  {
    id: "taxcollector",
    name: "The Crown Tax Collector",
    icon: "👑",
    tone: "neutral",
    charge: "the dues on hearth and home",
  },
  {
    id: "collectors",
    name: "The Collectors",
    icon: "📜",
    tone: "neutral",
    charge: "a due date the bank has set",
  },
  {
    id: "lamplighters",
    name: "The Lamplighters",
    icon: "🏮",
    tone: "neutral",
    charge: "light, heat, and water for the keep",
  },
  {
    id: "quartermaster",
    name: "The Quartermaster",
    icon: "🧺",
    tone: "neutral",
    charge: "provisions for the household",
  },
  {
    id: "courier",
    name: "The Courier",
    icon: "📯",
    tone: "neutral",
    charge: "letters, ledgers, and services by post",
  },
  {
    id: "healer",
    name: "The Healer",
    icon: "🌿",
    tone: "neutral",
    charge: "the health of the realm",
  },
  {
    id: "provisioner",
    name: "The Royal Provisioner",
    icon: "🌾",
    tone: "friendly",
    charge: "wages and yields arriving at the gates",
  },
  {
    id: "loansharks",
    name: "The Loan Sharks",
    icon: "🦈",
    tone: "hostile",
    charge: "they take more than they bring",
    byDecreeOnly: true,
  },
  {
    id: "parasite",
    name: "The Parasite",
    icon: "🪱",
    tone: "hostile",
    charge: "marked for banishment — a road to close",
    byDecreeOnly: true,
  },
  {
    id: "honored",
    name: "An Honored Guest",
    icon: "🕊️",
    tone: "friendly",
    charge: "welcome at the gates, always",
    byDecreeOnly: true,
  },
];

const roleById = new Map(ROLE_CATALOG.map((r) => [r.id, r]));

export type TravelerStatus = "approaching" | "at-gates" | "overdue" | "quiet";

export interface TravelerState {
  /** Stable id: "merchant:<name>" | "due:<accountId>" | "income:<name>". */
  id: string;
  source: "recurring" | "due" | "income";
  name: string;
  role: RoleId;
  /** True when the crown named this role (registry), false for a default. */
  roleAssigned: boolean;
  icon: string;
  tone: TravelerTone;
  /** Days until expected arrival; negative = past due / past expected. */
  etaDays: number;
  arrivesOn: string;
  status: TravelerStatus;
  /** Omitted when unreported — never a guessed sum. */
  amount?: ApiMoney;
  cadence: string;
  /** Precomputed kingdom-voice arrival line. */
  arrivalCopy: string;
  /** Provenance for the registry footnote. */
  basis: string;
}

export interface RoadsState {
  travelers: TravelerState[];
}

/** The Road Registry (meta extension, council.ts pattern): the crown's own
 * naming of its visitors. Survives fleeing — taste is not reign progress. */
export interface RoadRegistry {
  registryVersion: 1;
  /** travelerId -> roleId; unknown roleIds (newer catalog) fall back. */
  assignments: Record<string, RoleId>;
}

export interface KingdomMetaWithRoads extends KingdomMeta {
  roadRegistry?: RoadRegistry;
}

// ---------------------------------------------------------------------------
// Default-role heuristics — neutral only; byDecreeOnly roles never default.
// ---------------------------------------------------------------------------

const CATEGORY_ROLES: Record<string, RoleId> = {
  entertainment: "players",
  subscriptions: "courier",
  health: "healer",
  housing: "taxcollector",
  groceries: "quartermaster",
  delivery: "quartermaster",
  transport: "guard",
};

function dominantCategory(input: KingdomInput, merchant: string): string | null {
  const counts = new Map<string, number>();
  for (const t of input.transactions) {
    if (t.merchant !== merchant || t.amount.amountMinor >= 0) continue;
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Copy — kingdom voice: month names, no jargon, honest hedging.
// ---------------------------------------------------------------------------

const ordinal = (n: number): string => {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
};

const dateInVoice = (dateIso: string): string => {
  const day = Number(dateIso.slice(8, 10));
  return `the ${ordinal(day)} of ${monthName(dateIso.slice(0, 7))}`;
};

function arrivalCopyFor(
  status: TravelerStatus,
  etaDays: number,
  arrivesOn: string,
  source: TravelerState["source"],
): string {
  if (status === "at-gates") return "at the gates today";
  if (status === "quiet") {
    const days = Math.abs(etaDays);
    return `expected ${days} ${days === 1 ? "day" : "days"} ago — the road has gone quiet`;
  }
  if (status === "overdue") {
    const days = Math.abs(etaDays);
    return days === 0
      ? "waits at the gates — the bank marks this due date past"
      : `waits at the gates — the due date is ${days} ${days === 1 ? "day" : "days"} past`;
  }
  if (etaDays === 1) return source === "income" ? "arrives tomorrow" : "arrives tomorrow";
  return `arrives in ${etaDays} days — ${dateInVoice(arrivesOn)}`;
}

// ---------------------------------------------------------------------------
// The roads themselves.
// ---------------------------------------------------------------------------

interface CandidateShape {
  merchant?: unknown;
  averageAmount?: ApiMoney;
  averageGapDays?: unknown;
  lastSeen?: unknown;
  hits?: unknown;
}

function resolveRole(
  registry: RoadRegistry | undefined,
  id: string,
  fallback: RoleId,
): { role: RoadRole; assigned: boolean } {
  const assignedId = registry?.assignments[id];
  const assigned = assignedId === undefined ? undefined : roleById.get(assignedId);
  if (assigned !== undefined) return { role: assigned, assigned: true };
  return { role: roleById.get(fallback) as RoadRole, assigned: false };
}

function candidateTravelers(
  candidates: readonly CandidateShape[],
  input: KingdomInput,
  registry: RoadRegistry | undefined,
  source: "recurring" | "income",
): TravelerState[] {
  const travelers: TravelerState[] = [];
  for (const c of candidates) {
    // Runtime shape is wider than the type — skip anything malformed rather
    // than guess an ETA.
    if (
      typeof c.merchant !== "string" ||
      typeof c.lastSeen !== "string" ||
      typeof c.averageGapDays !== "number" ||
      !Number.isFinite(c.averageGapDays)
    ) {
      continue;
    }
    const gap = Math.round(c.averageGapDays);
    const arrivesOn = plusDays(c.lastSeen, gap);
    const etaDays = daysUntil(input.today, arrivesOn);
    if (etaDays === null) continue;
    // A long-quiet road leaves the list — the chronicle handles endings.
    if (etaDays < -QUIET_GRACE_DAYS) continue;

    const status: TravelerStatus =
      etaDays > 0 ? "approaching" : etaDays === 0 ? "at-gates" : "quiet";
    const fallback: RoleId =
      source === "income"
        ? "provisioner"
        : (CATEGORY_ROLES[dominantCategory(input, c.merchant) ?? ""] ?? "visitor");
    const { role, assigned } = resolveRole(
      registry,
      `${source === "income" ? "income" : "merchant"}:${c.merchant}`,
      fallback,
    );
    const seen = typeof c.hits === "number" && c.hits > 0 ? `${c.hits} times` : "several times";

    travelers.push({
      id: `${source === "income" ? "income" : "merchant"}:${c.merchant}`,
      source,
      name: c.merchant,
      role: role.id,
      roleAssigned: assigned,
      icon: role.icon,
      tone: role.tone,
      etaDays,
      arrivesOn,
      status,
      ...(c.averageAmount === undefined ? {} : { amount: c.averageAmount }),
      cadence: `comes every ${gap} days or so`,
      arrivalCopy: arrivalCopyFor(status, etaDays, arrivesOn, source),
      basis:
        source === "income"
          ? `income the surveyors traced ${seen} at a steady sum, last on ${dateInVoice(c.lastSeen)}`
          : `a charge the surveyors traced ${seen} at a steady sum, last on ${dateInVoice(c.lastSeen)}`,
    });
  }
  return travelers;
}

function dueTravelers(input: KingdomInput, registry: RoadRegistry | undefined): TravelerState[] {
  const travelers: TravelerState[] = [];
  const eligible = input.accounts.filter((a) => {
    const cls = classifyAccount(a);
    return (
      (cls === "credit" || cls === "mortgage" || cls === "student") &&
      a.nextDueDate !== undefined &&
      a.balance.amountMinor > 0
    );
  });
  const institutionCount = new Map<string, number>();
  for (const a of eligible) {
    institutionCount.set(a.institution, (institutionCount.get(a.institution) ?? 0) + 1);
  }

  for (const a of eligible) {
    const arrivesOn = a.nextDueDate as string;
    const etaDays = daysUntil(input.today, arrivesOn);
    if (etaDays === null) continue;
    // A real due date is never hidden — overdue is loud, not quiet.
    const status: TravelerStatus =
      a.isOverdue === true || etaDays < 0 ? "overdue" : etaDays === 0 ? "at-gates" : "approaching";
    const cls = classifyAccount(a);
    const fallback: RoleId = cls === "mortgage" ? "taxcollector" : "collectors";
    const { role, assigned } = resolveRole(registry, `due:${a.id}`, fallback);
    const disambiguate =
      (institutionCount.get(a.institution) ?? 0) > 1 && a.mask !== undefined ? ` ···${a.mask}` : "";

    travelers.push({
      id: `due:${a.id}`,
      source: "due",
      name: `${a.institution} collector${disambiguate}`,
      role: role.id,
      roleAssigned: assigned,
      icon: role.icon,
      tone: role.tone,
      etaDays,
      arrivesOn,
      status,
      ...(a.minPayment === undefined ? {} : { amount: a.minPayment }),
      cadence: "a due date the bank has set",
      arrivalCopy: arrivalCopyFor(status, etaDays, arrivesOn, "due"),
      basis: `a due date${a.minPayment === undefined ? "" : " and minimum"} the bank itself reports`,
    });
  }
  return travelers;
}

/** All roads into the kingdom, sorted by arrival. Empty input → empty list —
 * the panel renders nothing (silence over false comfort). */
export function computeRoads(input: KingdomInput, registry: RoadRegistry | undefined): RoadsState {
  const recurring = (input.metrics?.recurringCandidates ?? []) as CandidateShape[];
  const income = ((input.metrics as { incomeCandidates?: CandidateShape[] } | null)
    ?.incomeCandidates ?? []) as CandidateShape[];

  const travelers = [
    ...candidateTravelers(recurring, input, registry, "recurring"),
    ...candidateTravelers(income, input, registry, "income"),
    ...dueTravelers(input, registry),
  ].sort((x, y) => {
    if (x.etaDays !== y.etaDays) return x.etaDays - y.etaDays;
    return Math.abs(y.amount?.amountMinor ?? 0) - Math.abs(x.amount?.amountMinor ?? 0);
  });

  return { travelers };
}

/** The neutral fallback the heuristics would pick — shown in the picker. */
export function defaultRoleFor(traveler: TravelerState): RoadRole {
  return roleById.get(traveler.role) as RoadRole;
}

export function roleFor(id: RoleId): RoadRole {
  return roleById.get(id) ?? (roleById.get("visitor") as RoadRole);
}

export const fmtAmount = (m: ApiMoney): string => fmtMinor(Math.abs(m.amountMinor));

// ---------------------------------------------------------------------------
// Registry ops — pure, spread-preserving, CAS-replayable (economy.purchase
// is the template). Null = nothing to write.
// ---------------------------------------------------------------------------

export function assignRole(
  meta: KingdomMeta,
  travelerId: string,
  roleId: RoleId,
): KingdomMeta | null {
  if (!roleById.has(roleId)) return null;
  const current = (meta as KingdomMetaWithRoads).roadRegistry;
  if (current?.assignments[travelerId] === roleId) return null;
  const registry: RoadRegistry = {
    registryVersion: 1,
    assignments: { ...current?.assignments, [travelerId]: roleId },
  };
  return { ...meta, roadRegistry: registry } as KingdomMeta;
}

export function clearRole(meta: KingdomMeta, travelerId: string): KingdomMeta | null {
  const current = (meta as KingdomMetaWithRoads).roadRegistry;
  if (current === undefined || !(travelerId in current.assignments)) return null;
  const { [travelerId]: _, ...rest } = current.assignments;
  return {
    ...meta,
    roadRegistry: { registryVersion: 1, assignments: rest },
  } as KingdomMeta;
}

/**
 * Fleeing founds a new reign — spends, unlocks, and the council die with the
 * old crown. The Road Registry does NOT: naming your visitors is taste, like
 * a category correction, not earned progress. Carry it across.
 */
export function carryRegistryAcrossFlee(oldMeta: KingdomMeta, newMeta: KingdomMeta): KingdomMeta {
  const registry = (oldMeta as KingdomMetaWithRoads).roadRegistry;
  if (registry === undefined) return newMeta;
  return { ...newMeta, roadRegistry: registry } as KingdomMeta;
}
