import type { Account, ApiEvent, ApiMoney, MetricsView, Txn } from "@platform/ui";

/**
 * Kingdom v2 model types. The kingdom IS the balance sheet: every displayed
 * number traces to a real statement line or served metric (`basis`), and
 * anything judged from an incomplete month carries `provisional`.
 */

/** Widened API views — fields the API serves but @platform/ui doesn't type. */
export interface KingdomAccount extends Account {
  subtype?: string;
  creditLimit?: ApiMoney;
}

export interface KingdomTxn extends Txn {
  accountId?: string;
}

export interface MonthSummaryView {
  month: string;
  transactionCount: number;
  totalSpending: ApiMoney;
  spendingByCategory: { category: string; amount: ApiMoney }[];
  netCashFlow: ApiMoney;
}

export interface KingdomMetrics extends MetricsView {
  month?: string;
  completedMonth?: MonthSummaryView;
  priorMonth?: MonthSummaryView;
  mtd?: MonthSummaryView;
}

export interface KingdomInput {
  accounts: KingdomAccount[];
  transactions: KingdomTxn[];
  events: ApiEvent[];
  metrics: KingdomMetrics | null;
  /** Injected wall-clock date (ISO) — the model never reads a clock. */
  today: string;
}

export type AgeId = 1 | 2 | 3 | 4;

export interface AgeGate {
  id: string;
  label: string;
  themedLabel: string;
  passed: boolean;
  provisional: boolean;
  evidence: string;
}

export interface AgeState {
  current: AgeId;
  name: string;
  icon: string;
  tagline: string;
  gatesToNext: AgeGate[] | null;
  provisional: boolean;
}

export type ResourceKey = "gold" | "grain" | "stone" | "builders" | "happiness";

export interface ResourceState {
  key: ResourceKey;
  themeName: string;
  icon: string;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  displayValue: string;
  basis: string;
  provisional: boolean;
}

export type StructureKey =
  | "keep"
  | "granary"
  | "walls"
  | "treasury"
  | "caravans"
  | "market"
  | "festival"
  | "manor"
  | "guildDebt"
  | "watchtowers"
  | "banditCamp";

export interface StructureState {
  key: StructureKey;
  name: string;
  icon: string;
  exists: boolean;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  detail: string;
  lien?: boolean;
  locked?: boolean;
  hostile?: boolean;
}

export type ThreatKind = "bandits" | "winter" | "feast" | "drought" | "fire";

export interface ThreatState {
  kind: ThreatKind;
  active: boolean;
  dormantReason?: "no-data" | "conditions-clear";
  severity: 0 | 1 | 2 | 3;
  title: string;
  narrative: string;
  causes: { label: string; amount?: ApiMoney }[];
  basis: string;
}

export interface MoatComponent {
  key: "runway" | "leverage" | "liquidity" | "obligations";
  label: string;
  score: number;
  max: number;
  evidence: string;
  provisional: boolean;
}

export interface MoatState {
  score: number;
  uncapped: number;
  cappedByBandits: boolean;
  tier: "dry" | "narrow" | "broad" | "vast";
  tierLabel: string;
  components: MoatComponent[];
}

export interface ChronicleEntry {
  date: string;
  icon: string;
  headline: string;
  tone: "good" | "bad" | "info";
  source: "event" | "txn";
  refId: string;
}

export interface KingdomState {
  asOf: string;
  age: AgeState;
  resources: ResourceState[];
  structures: StructureState[];
  threats: ThreatState[];
  moat: MoatState;
  chronicle: ChronicleEntry[];
  surveying: boolean;
}
