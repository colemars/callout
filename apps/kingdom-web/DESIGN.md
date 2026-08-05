# Financial Kingdom — Game Design (v2)

> The hook is not "gamify budgeting." The hook is: **turn your real financial
> life into a living kingdom that rewards resilience, not spending less.**
> Most finance apps optimize for tracking. This one optimizes for building.

## The core loop

**Observe → Decide → Improve → Watch your kingdom evolve.**

Every time the user opens the app: (1) something in the kingdom has changed,
(2) they understand why, (3) they make one financial decision, (4) the kingdom
visibly improves. Opening the app isn't checking numbers — it's *"what
happened in my kingdom while I was away?"*

## The Prime Rule (amended in v2)

The game has two layers with different laws:

**The simulation layer is real.** Wealth, threats, the moat, the chronicle —
every number traces to a real statement line or a served metric (each carries
a machine-checkable `basis`). Nothing is estimated, nothing invented. Where
data is missing the kingdom stays silent — never a false all-clear.

**The meta layer is earned.** Influence and Progress are not money and never
pretend to be. They form a **ledger of verified financial behavior**: every
grant traces to a platform event the engine actually derived from statements.
Influence cannot be bought — not with real money, not with rich balances.

**No engagement rewards.** Logging in, streaks of opening the app, watching
content: worth zero. Showing up earns nothing; *behaving* earns everything.
Scarcity is what makes Influence mean something.

**And never punish living.** Happiness spending is a resource, not a sin. The
satisfying progression is not "spend nothing" — it's "every dollar you
intentionally direct strengthens a different part of your kingdom."

## The three currencies

| Currency | Nature | Source | Spendable? |
|---|---|---|---|
| **Wealth** | Real | Bank/investment/debt data — the simulation input (today's `KingdomState`) | Never in-game |
| **Influence** | Earned | Verified financial behavior (see the earn table) | Yes — construction, upgrades, cosmetics |
| **Progress** | Permanent | What Influence built + milestones unlocked | Never decreases |

The pivotal design decision: **financial behavior → Influence → Kingdom**, not
money → kingdom. Someone with $5M isn't handed a finished kingdom; someone
starting from nothing gets real progression. A college student and a
high-net-worth player both have a game.

(The simulation still reflects Wealth — a rich player's *castle* is big. But
their *kingdom's growth* — what gets built, unlocked, decorated — comes only
from behavior. The moat already works this way: margin of safety, not size.)

## The earn table (Influence)

Every earn event must be **verifiable from platform data** and is granted by a
deterministic fold over the event history — replayable, auditable, immune to
double-granting on re-sync.

| Behavior | Proof (platform event / metric) | Notes |
|---|---|---|
| Month closes with positive cash flow | `NET_CASH_FLOW_POSITIVE` | Influence ∝ surplus, capped |
| High-interest debt reduced | `HIGH_INTEREST_DEBT_DECREASED` (delta) | ∝ amount paid down |
| High-interest debt eliminated | balance reaches 0 (milestone event) | Large one-time grant |
| Emergency runway milestone crossed | runway crosses 1/3/6/12 months (milestone event) | One-time per tier |
| Under-budget streak | N consecutive months all budgets on pace (streak event) | Grows with streak |
| Standing tithe dropped | `RECURRING_EXPENSE_REMOVED` | The cancelled-Netflix moment |
| Goal completed | `GOAL_ON_TRACK` at target / goal reached (milestone event) | |
| Savings-rate tier reached | savings rate crosses 5/10/20/30% (milestone event) | One-time per tier |

**Unverifiable today — advisors may NOT promise these until their data source
lands:**

- ~~Retirement contributions~~ — **INTEGRATED (2026-08-04)**: Plaid Investments
  ships contributions/dividends as explicit typed records into
  `platform.investment_activity`; the engine derives
  `RETIREMENT_CONTRIBUTION_MADE` / `_INCREASED` and real
  `PASSIVE_INCOME_INCREASED` events, and Age 4's gate now accepts measured
  passive income (dividends) alongside the 4%-rule proxy. The Guildmaster has
  his voice. Balance deltas remain forbidden as behavior proof.
  (Caveats stand: custodian coverage varies — unsupported items report
  `investments: "unsupported"` and the Council stays quiet for them;
  separately priced per investment account in production.)
- Income raises as deliberate acts, insurance purchases, "learning something"
  — no data source on the horizon; the Council never speaks of them.

New platform event vocabulary this requires (future phase): milestone tiers
(`EMERGENCY_FUND_MILESTONE`, `SAVINGS_RATE_MILESTONE`), `DEBT_ELIMINATED`,
`UNDER_BUDGET_STREAK`, `GOAL_COMPLETED`. All derived deterministically in the
insight engine — same discipline as everything else it emits.

## Never destroy

A bad month never burns anything down. Instead:

- Workers leave. Construction pauses. Fields idle. Raiders grow bolder.
- Progress **never** decreases. Buildings stand. Unlocks stay unlocked.
- Fix the finances → workers return, construction resumes.

Everything simply *stops growing* until behavior recovers. This is
psychologically right (strategy game, not guilt game) and operationally right:
a Plaid outage or bad sync must never destroy a kingdom.

**One sanctioned exception: fleeing the kingdom.** The player may abandon the
realm and found a new one (a fresh epoch on the event cursor). Influence,
unlocks, and quest grants stay behind with the old crown; a reduced founding
endowment is struck from currently-held state milestones. Nothing crosses
foundedAt — which is exactly what makes repeated fleeing pointless — and real
financial data is untouched: you cannot flee your debts. Built for the
returning-after-long-absence player, offered alongside (never instead of) the
normal replay.

## Workers & allocation (the strategy layer)

Workers represent **available financial capacity**: monthly surplus ÷ $100.
$400 surplus → 4 workers; $800 → 8. Negative months: workers drift away.

Allocation sliders direct capacity + banked Influence across projects — Farm
30% · Walls 40% · Treasury 20% · Marketplace 10% — so real savings
automatically convert into chosen kingdom growth. Assigning workers IS
allocating attention to your financial plan; the sliders are where strategy
begins. (The sliders never move real money — they direct the *game's*
representation of your capacity.)

## The tech tree

Unlocks are **earned through financial milestones, never purchased**:

| Milestone (verifiable) | Unlock |
|---|---|
| Emergency fund complete (3mo) | Windmill |
| Runway 6 months | Deep Granary |
| Credit utilization under 10% | Stone Walls |
| No credit-card debt | Royal Mint |
| Retirement vault exists & funded | Treasury Vaults |
| First under-budget streak (3mo) | Bakery |
| Positive cash flow 6 months running | Harbor |

(Credit utilization is computable: card balances vs `creditLimit`, both
served.) Milestones make users *want* the financial achievement — the unlock
is the celebration, not the incentive to spend.

## Quests

The app generates quests automatically from engine output, in kingdom voice,
with **measurable completion conditions**:

> *"The kingdom spends too much on court feasts."* — feast spending fell 20%
> vs last moon → **+300 Influence, unlock Bakery**

> *"The moneylenders grow stronger."* — pay $500 toward the cards (visible as
> `HIGH_INTEREST_DEBT_DECREASED` ≥ $500) → **raiders retreat, +500 Influence,
> unlock Barracks**

The quests ARE the financial plan, restated as strategy.

## The Kingdom Council (signature feature)

Weekly ritual. A handful of advisors meet — each proposes **one** actionable,
engine-derived, verifiable recommendation. The player has attention for only
one or two:

- **The Treasurer** (cash flow & runway): "Save another $250 this month and we
  complete the granary."
- **The Master Builder** (spending & budgets): "End one standing tithe and we
  finish the east wall." *(completion = `RECURRING_EXPENSE_REMOVED`)*
- **The Captain of the Guard** (debt & threats): "Pay the raiders' ransom down
  $500 and the roads grow safer."
- **The Guildmaster** (investing & goals): speaks only when the data can back
  the promise — today that's goal pacing and treasury balances, not
  contribution percentages.

Backing a proposal creates the week's active quest(s). Real financial actions,
presented as strategic kingdom decisions — a decision loop, not a grind. This
is what people come back for: not to watch numbers change, but to **decide the
future of their kingdom.**

## Cosmetic layer & endgame

Cosmetics are where people *stay* (Animal Crossing's lesson): castle themes,
seasons, lantern festivals, banners, bridges, pets — bought with Influence,
kept forever (Progress). Never gameplay-relevant, never real-money.

Endgame: zoom out. Villages, ports, roads, trade routes, windmills, harbors —
an enormous kingdom that exists because of years of good financial decisions.
That's the FI screenshot people share.

## The simulation layer (carried forward from v1 — still canonical)

- **Four Ages** of financial maturity with evidence-bearing gates: Survive the
  Winter → Fortify → Expand → Prosperity (4%-rule proxy for FI).
- **Five resources**: 🪙 Gold (liquidity) · 🌾 Grain (runway) · 🪨 Stone
  (long-term assets) · 🔨 Builders (free cash flow) · 🎉 Happiness (lifestyle
  share; low = gentle warning, high stays warm).
- **Enemies**: 🏴 Bandits (high-interest debt) · ❄️ Winter (essential-cost
  inflation) · 🍗 Feasts (lifestyle *jumps*, travel exempt) · 🌵 Drought
  (income loss) · 🔥 Fires (outsized one-offs, absorbed by the granary).
- **The Moat = margin of safety, not wealth** (runway/leverage/liquidity/
  obligations; bandit cap at 74). Insurance & income diversification join when
  data exists.
- **The Chronicle**: real ledger lines and platform events in kingdom voice,
  every entry refId-traceable.
- Implementation: pure `kingdomModel` + `computeKingdomDiff` — see
  [CONTRACT.md](CONTRACT.md) for the engine-agnostic JSON contract.

## Architecture implications (design only — NOT yet built)

1. **Platform**: milestone/streak events in the insight engine (deterministic,
   explainable, same event-diff discipline); later, a generic per-user
   per-product **state store** (opaque blob + version) so Progress/Influence
   survive devices — products currently have no server-side persistence, and
   the blob keeps product logic out of the platform.
2. **Product (kingdom-web)**: the Influence fold over event history; quest &
   Council generation from engine output; Progress state; allocation UI.
3. **Build order**: milestone events → product-state store → Influence ledger
   + text Council (works before any canvas) → quests/tech tree → allocation →
   renderer (Phaser in-page, per CONTRACT.md).

## Punt list

**Liabilities INTEGRATED (2026-08-04)**: Plaid Liabilities feeds per-card APRs,
minimum payments, due dates, and overdue flags into `platform.account_liabilities`
(served on `/api/v1/accounts`). The bandit threat/camp show the raiders' toll
(balance × bank-reported APR ÷ 12, "≈"-marked); cards without a reported rate
are counted as "rates hidden", never guessed at. Items linked before liabilities
consent gain it via a Counting House re-oath (update-mode
`additional_consented_products`).


- Insurance + income diversification in the moat (no data)
- Rentals ("villages") and businesses ("workshops") (no data)
- Home value / Manor equity (Zillow API is partner-only; RentCast or manual
  entry as a future platform slice)
- True passive-income measurement for Age 4 (4%-rule proxy today)
- CPI-based Winter (own-spend proxy today)
- Stone trend arrows (needs asset balance history from engine snapshots)
- Income-raise and insurance verification (no data source on the horizon)
- The map itself — graphics after the meta-game proves out in text
- The calendar view (`/api/v1/insights/history` + `/events?since=` exist to
  feed it)

## The Vista — renderer staging (2026-08-05)

Stage 1 shipped: the isometric authored map (fixed slot per StructureKey,
roads from the map edges, reserved build plots) as the throne room's hero
panel — structures at art tier, travelers on roads with distance ∝ ETA,
in-canvas steward's panels (DOM StructureGrid demoted to boot-failure
fallback), placeholder "surveyor's sketch" art behind the assets.ts
contract (ART.md is the generation brief; Cole approves the real sheet).

- ~~**Stage 2**~~ — SHIPPED (2026-08-05): villagers wander the commons scaled by the builders level (deterministic by index — the same kingdom always bustles the same way); day/dusk follows the live color-scheme, rebooting the canvas on theme change
- ~~**Stage 3**~~ — SHIPPED (2026-08-05): active threats become atmosphere — winter snowfall, drought parches the land, fire embers over the market, bandit-camp smoke, feast confetti over the festival grounds; severity scales each effect, dormant threats render nothing
- ~~**Stage 4**~~ — SHIPPED (2026-08-05): traveler taps open the Road Registry in-world (role grid, by-decree group, clear, honest note + basis); naming flows back through React's CAS handlers and the fresh model re-tints the traveler; the DOM TheRoads section is boot-failure fallback only
- ~~**Stage 5**~~ — SHIPPED (2026-08-05): the replay reel — KingdomDelta feed maps (purely, capped at 8) to caption-chip moments with sparkle bursts and structure pulses; live tier changes sparkle too; the DOM text strip remains the ledger
- **Stage 6** — Influence build-plots (spends raise structures on the reserved plots); real art atlas swap via assets.ts
