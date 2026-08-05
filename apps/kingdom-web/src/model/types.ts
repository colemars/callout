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
  /** Bank-reported liability facts (Plaid Liabilities), when consented. */
  apr?: number;
  aprType?: string;
  minPayment?: ApiMoney;
  nextDueDate?: string;
  isOverdue?: boolean;
}

export interface KingdomTxn extends Txn {
  accountId?: string;
}

/** Investment activity as served by /api/v1/investments/activity. */
export interface KingdomInvestmentActivity {
  id: string;
  accountId: string;
  date: string;
  description: string;
  kind: string;
  /** Positive = cash into the account. */
  amount: ApiMoney;
  ticker?: string;
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
  investments?: {
    contributionsMtd: ApiMoney;
    contributionsCompletedMonth: ApiMoney;
    contributionsPriorMonth: ApiMoney;
    passiveIncomeCompletedMonth: ApiMoney;
    passiveIncomePriorMonth: ApiMoney;
    passiveIncomeMonthly: ApiMoney | null;
  };
  /** Trailing income average from the engine (server-persisted snapshots). */
  incomeBaseline?: { monthsCounted: number; averageMonthly: ApiMoney | null };
  goalStatuses?: {
    goalId: string;
    kind: string;
    evaluable: boolean;
    onTrack: boolean | null;
    expected: ApiMoney | null;
    actual: ApiMoney | null;
  }[];
}

/** A sworn undertaking as served by /api/v1/goals. */
export interface KingdomGoal {
  id: string;
  kind: "savings_net_flow" | "balance_target" | "debt_paydown";
  accountId?: string;
  targetAmount: ApiMoney;
  targetDate?: string;
  active: boolean;
}

export interface KingdomInput {
  accounts: KingdomAccount[];
  goals?: KingdomGoal[];
  transactions: KingdomTxn[];
  investmentActivity: KingdomInvestmentActivity[];
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

/** Machine-readable unit for game/engine consumers (see CONTRACT.md). */
export type ValueUnit = "minor" | "months" | "ratio" | "count" | "score";

export interface ResourceState {
  key: ResourceKey;
  themeName: string;
  icon: string;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  /** Raw numeric value in `unit`; null when unmeasured. */
  value: number | null;
  /** The bound of the top tier (for meters); null when unbounded/unmeasured. */
  max: number | null;
  unit: ValueUnit;
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
  | "oaths"
  | "banditCamp";

export interface StructureLine {
  /** What the row is about (a decree, a card, a vault). */
  label: string;
  /** Section divider within a report (renders as a small heading). */
  heading?: boolean;
  /** The headline figure, right-aligned. */
  value?: string;
  /** One-line explanation beneath, muted. */
  note?: string;
  tone?: "good" | "warn" | "bad";
}

export interface StructureState {
  key: StructureKey;
  name: string;
  icon: string;
  exists: boolean;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  /** Raw numeric value in `unit`; null when the structure has no natural number. */
  value: number | null;
  unit: ValueUnit;
  detail: string;
  /** Optional per-item account of the detail (e.g. one line per watched decree). */
  lines?: StructureLine[];
  /** Where the numbers come from — the panel's provenance footnote. */
  basis?: string;
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
  /** Optional per-line account of the comparison (e.g. Winter's categories). */
  breakdown?: ThreatBreakdownLine[];
  /** The months a comparative threat judged (ISO YYYY-MM) — lets the UI open the ledger. */
  months?: { current: string; previous: string };
}

export interface ThreatBreakdownLine {
  label: string;
  /** Minor units, magnitudes. */
  previousMinor: number;
  currentMinor: number;
  deltaMinor: number;
  /** Income-like lines: a rise is good news (spending lines omit this). */
  risingIsGood?: boolean;
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
  /** Contract version for external consumers; bump on breaking shape changes. */
  schemaVersion: 1;
  asOf: string;
  age: AgeState;
  resources: ResourceState[];
  structures: StructureState[];
  threats: ThreatState[];
  moat: MoatState;
  chronicle: ChronicleEntry[];
  surveying: boolean;
}
